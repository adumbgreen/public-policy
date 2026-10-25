"""Scores a scenario. Runs in the worker process, never in a web request."""

from app.schemas import ScenarioDefinition

ENGINE_VERSION = "0"


class EngineNotReady(Exception):
    pass


def run(definition: ScenarioDefinition) -> dict:
    raise EngineNotReady(
        "The simulation engine isn't built yet. It needs PolicyEngine's household data "
        "and the budget baseline, which can't be downloaded until network access is opened."
    )
