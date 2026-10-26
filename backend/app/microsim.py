"""PolicyEngine-US microsimulation, split by household across warm worker processes.

Each shard process loads its share of PolicyEngine's household dataset once and keeps it, along
with its baseline results, in memory. Households are independent, so the shards' results add up
exactly to a single full run. Importing PolicyEngine takes about 40 seconds, so it only happens in
the shard processes, never in the API.
"""

import math
import multiprocessing as mp
import os
import pickle
import traceback
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

# One parameter change: (PolicyEngine parameter path, value, index to inflation)
Change = tuple[str, float | bool, bool]


@dataclass
class YearResult:
    """Household-level results for one tax year, across all shards."""

    weight: np.ndarray
    market_income: np.ndarray
    baseline_tax: np.ndarray
    reform_tax: np.ndarray


def _dataset_path() -> str:
    from huggingface_hub import hf_hub_download
    from policyengine_us.system import DEFAULT_DATASET

    # hf://datasets/<owner>/<repo>/<file>@<revision>
    owner, repo, rest = DEFAULT_DATASET.removeprefix("hf://datasets/").split("/", 2)
    filename, revision = rest.split("@")
    return hf_hub_download(
        repo_id=f"{owner}/{repo}", filename=filename, repo_type="dataset", revision=revision
    )


def _load_shard(index: int, count: int):
    from policyengine_us.data.dataset_schema import USSingleYearDataset

    full = USSingleYearDataset(file_path=_dataset_path())
    household = full.household[full.household.household_id.values % count == index]
    person = full.person[full.person.person_household_id.isin(set(household.household_id))]

    def members(table, id_column, person_column):
        return table[table[id_column].isin(set(person[person_column]))] if len(table) else table

    return USSingleYearDataset(
        person=person,
        household=household,
        tax_unit=members(full.tax_unit, "tax_unit_id", "person_tax_unit_id"),
        spm_unit=members(full.spm_unit, "spm_unit_id", "person_spm_unit_id"),
        family=members(full.family, "family_id", "person_family_id"),
        marital_unit=members(full.marital_unit, "marital_unit_id", "person_marital_unit_id"),
        time_period=int(full.time_period),
    )


def _one_year(base, year: int):
    """The shard's households projected to one year. A simulation holding only that year's data
    uses far less memory than one holding every year."""
    from policyengine_us.data.dataset_schema import USMultiYearDataset
    from policyengine_us.data.economic_assumptions import extend_single_year_dataset

    return USMultiYearDataset(
        datasets=[extend_single_year_dataset(base, end_year=year).get_year(year)]
    )


def build_reform(parameters, changes: list[Change], start_year: int, end_year: int) -> dict:
    """Reform.from_dict input. Indexed values grow with each parameter's own uprating and rounding."""
    reform = {}
    for path, value, indexed in changes:
        uprating = parameters.get_child(path).metadata.get("uprating") if indexed else None
        if not uprating or isinstance(value, bool):
            reform[path] = {f"{start_year}-01-01.2100-12-31": value}
            continue
        if isinstance(uprating, str):
            uprating = {"parameter": uprating}
        index = parameters.get_child(uprating["parameter"])
        rounding = uprating.get("rounding")
        periods = {}
        for year in range(start_year, end_year + 1):
            amount = value * index(f"{year}-01-01") / index(f"{start_year}-01-01")
            if rounding:
                step = rounding["interval"]
                round_fn = {"downwards": math.floor, "upwards": math.ceil}.get(
                    rounding["type"], round
                )
                amount = round_fn(amount / step) * step
            last = year == end_year
            periods[f"{year}-01-01.{2100 if last else year}-12-31"] = amount
        reform[path] = periods
    return reform


def _household_arrays(sim, year: int) -> dict[str, np.ndarray]:
    return {
        "weight": sim.calculate("household_weight", year).values,
        "market_income": sim.calculate("household_market_income", year).values,
        "tax": sim.calculate("income_tax", year, map_to="household").values,
    }


def _in_child_process(compute: Callable[[], dict]) -> dict:
    """Run compute() in a forked copy of this process and return its result.

    PolicyEngine holds on to memory after a simulation (about 0.7 GB per year for a 5% shard),
    so each simulation runs in a fork that exits afterward and gives all of it back. The fork
    shares the already loaded model and data, so it starts instantly.
    """
    read_fd, write_fd = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(read_fd)
        try:
            payload = ("ok", compute())
        except BaseException:  # noqa: BLE001 - reported to the parent
            payload = ("error", traceback.format_exc())
        with os.fdopen(write_fd, "wb") as pipe:
            pickle.dump(payload, pipe)
        os._exit(0)

    os.close(write_fd)
    with os.fdopen(read_fd, "rb") as pipe:
        data = pipe.read()
    _, status = os.waitpid(pid, 0)
    if not data:
        raise RuntimeError(
            f"A simulation year process died (status {status}), possibly out of memory."
        )
    kind, value = pickle.loads(data)
    if kind == "error":
        raise RuntimeError(value)
    return value


def _shard_main(index: int, count: int, conn) -> None:
    from policyengine_core.reforms import Reform
    from policyengine_us import Microsimulation
    from policyengine_us.system import system

    base = _load_shard(index, count)
    baselines: dict[int, dict[str, np.ndarray]] = {}
    conn.send(("ready", None))

    while (message := conn.recv()) is not None:
        changes, years = message
        try:
            reform = build_reform(system.parameters, changes, years[0], years[-1])
            # Building the reformed tax system takes about 20 seconds, so do it once per run.
            reformed_system = Microsimulation.default_tax_benefit_system(
                reform=Reform.from_dict(reform, country_id="us")
            )
            results = {}
            for year in years:
                if year not in baselines:
                    baselines[year] = _in_child_process(
                        lambda year=year: _household_arrays(
                            Microsimulation(dataset=_one_year(base, year)), year
                        )
                    )
                    conn.send(("progress", ("baseline", year)))
                reformed = _in_child_process(
                    lambda year=year, system_=reformed_system: _household_arrays(
                        Microsimulation(dataset=_one_year(base, year), tax_benefit_system=system_),
                        year,
                    )
                )
                results[year] = {
                    "weight": baselines[year]["weight"],
                    "market_income": baselines[year]["market_income"],
                    "baseline_tax": baselines[year]["tax"],
                    "reform_tax": reformed["tax"],
                }
                conn.send(("progress", ("reform", year)))
            conn.send(("done", results))
        except Exception:  # noqa: BLE001 - any failure is reported to the parent process
            conn.send(("error", traceback.format_exc()))


class ShardPool:
    """A fixed set of shard processes. Shard i always holds the households with id % count == i."""

    def __init__(self, count: int):
        ctx = mp.get_context("spawn")
        self.count = count
        self.connections = []
        self.processes = []
        for index in range(count):
            parent, child = ctx.Pipe()
            process = ctx.Process(target=_shard_main, args=(index, count, child), daemon=True)
            process.start()
            self.connections.append(parent)
            self.processes.append(process)
        for conn in self.connections:
            kind, _ = conn.recv()
            assert kind == "ready"

    def run(
        self,
        changes: list[Change],
        years: list[int],
        progress: Callable[[str], None] = lambda _: None,
    ) -> dict[int, YearResult]:
        for conn in self.connections:
            conn.send((changes, years))

        done: dict[int, dict] = {}
        steps: dict[tuple[str, int], int] = {}
        errors = []
        while len(done) + len(errors) < self.count:
            for i, conn in enumerate(self.connections):
                if i in done or not conn.poll(0.5):
                    continue
                try:
                    kind, payload = conn.recv()
                except EOFError:
                    raise RuntimeError(
                        f"Simulation shard {i} stopped unexpectedly, possibly out of memory."
                    ) from None
                if kind == "progress":
                    steps[payload] = steps.get(payload, 0) + 1
                    if steps[payload] == self.count:
                        stage, year = payload
                        progress(f"{'Baseline' if stage == 'baseline' else 'Policy'} {year} done")
                elif kind == "done":
                    done[i] = payload
                else:
                    errors.append(payload)
                    done[i] = None
        if errors:
            raise RuntimeError(f"A simulation shard failed:\n{errors[0]}")

        return {
            year: YearResult(
                **{
                    key: np.concatenate([done[i][year][key] for i in range(self.count)])
                    for key in ("weight", "market_income", "baseline_tax", "reform_tax")
                }
            )
            for year in years
        }

    def terminate(self) -> None:
        for process in self.processes:
            process.kill()
            process.join(timeout=10)

    def close(self) -> None:
        for conn in self.connections:
            conn.send(None)
        for process in self.processes:
            process.join(timeout=10)


def deciles(result: YearResult) -> list[dict]:
    """Household-weighted income deciles by market income, with the change in income tax."""
    order = np.argsort(result.market_income, kind="stable")
    weight = result.weight[order]
    change = (result.reform_tax - result.baseline_tax)[order]
    # Each household goes in the decile that contains the midpoint of its weight.
    midpoint = (np.cumsum(weight) - weight / 2) / weight.sum()
    group = np.minimum((midpoint * 10).astype(int), 9)
    rows = []
    for decile in range(10):
        mask = group == decile
        households = weight[mask].sum()
        total = (weight[mask] * change[mask]).sum()
        rows.append(
            {
                "decile": decile + 1,
                "households": float(households),
                "total_tax_change": float(total),
                "average_tax_change": float(total / households) if households else 0.0,
                "share_with_tax_cut": float(weight[mask][change[mask] < -1].sum() / households)
                if households
                else 0.0,
            }
        )
    return rows
