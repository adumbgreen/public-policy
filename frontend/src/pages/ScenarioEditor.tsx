import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Code,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, type NewProgram, type Scenario, type ScenarioDefinition } from "../api";

type Draft = Pick<Scenario, "name" | "description" | "definition">;

// PolicyEngine-US filing statuses for gov.irs.deductions.standard.amount
const FILING_STATUSES = [
  { key: "SINGLE", label: "Single" },
  { key: "JOINT", label: "Married filing jointly" },
  { key: "HEAD_OF_HOUSEHOLD", label: "Head of household" },
  { key: "SEPARATE", label: "Married filing separately" },
  { key: "SURVIVING_SPOUSE", label: "Surviving spouse" },
];

const VAT_EXCLUSIONS = [
  { value: "healthcare", label: "Healthcare" },
  { value: "housing", label: "Housing" },
];

// Reform periods run from the scenario's first year onward.
function reformPeriod(startYear: number) {
  return `${startYear}-01-01.2100-12-31`;
}

function setParameter(
  definition: ScenarioDefinition,
  path: string,
  value: number | null,
): ScenarioDefinition {
  const changes = { ...definition.income_tax.parameter_changes };
  if (value === null) {
    delete changes[path];
  } else {
    changes[path] = { [reformPeriod(definition.options.start_year)]: value };
  }
  return { ...definition, income_tax: { parameter_changes: changes } };
}

function setStartYear(definition: ScenarioDefinition, startYear: number): ScenarioDefinition {
  const changes = Object.fromEntries(
    Object.entries(definition.income_tax.parameter_changes).map(([path, periods]) => [
      path,
      { [reformPeriod(startYear)]: Object.values(periods)[0] },
    ]),
  );
  return {
    ...definition,
    options: { ...definition.options, start_year: startYear },
    income_tax: { parameter_changes: changes },
  };
}

export function ScenarioEditor() {
  const { slug = "" } = useParams();
  const queryClient = useQueryClient();
  const clipboard = useClipboard();
  const scenario = useQuery({ queryKey: ["scenario", slug], queryFn: () => api.getScenario(slug) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    if (scenario.data) {
      const { name, description, definition } = scenario.data;
      setDraft({ name, description, definition });
    }
  }, [scenario.data]);

  const save = useMutation({
    mutationFn: (body: Draft) => api.updateScenario(slug, body),
    onSuccess: (saved) => {
      queryClient.setQueryData(["scenario", slug], saved);
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
    onError: (error) => notifications.show({ color: "red", title: "Save failed", message: error.message }),
  });

  const startRun = useMutation({
    mutationFn: async (body: Draft) => {
      await save.mutateAsync(body);
      return api.startRun(slug);
    },
    onSuccess: (run) => setRunId(run.id),
  });

  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId!),
    enabled: runId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "succeeded" || query.state.data?.status === "failed"
        ? false
        : 2000,
  });

  if (scenario.isError) return <Text c="red">{scenario.error.message}</Text>;
  if (!draft) return <Loader />;

  const def = draft.definition;
  const setDefinition = (definition: ScenarioDefinition) => setDraft({ ...draft, definition });
  const setPrograms = (new_programs: NewProgram[]) => setDefinition({ ...def, new_programs });

  return (
    <Stack maw={900}>
      <Group justify="space-between" align="flex-end">
        <TextInput
          label="Scenario name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
          style={{ flex: 1 }}
        />
        <Button variant="default" onClick={() => clipboard.copy(window.location.href)}>
          {clipboard.copied ? "Link copied" : "Copy link"}
        </Button>
        <Button variant="default" onClick={() => save.mutate(draft)} loading={save.isPending}>
          Save
        </Button>
        <Button onClick={() => startRun.mutate(draft)} loading={startRun.isPending}>
          Save and run
        </Button>
      </Group>
      <Textarea
        label="Description"
        autosize
        minRows={2}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })}
      />

      <Card withBorder>
        <Title order={4} mb="sm">
          Simulation
        </Title>
        <Group align="flex-end">
          <NumberInput
            label="First year"
            value={def.options.start_year}
            min={2026}
            max={2035}
            onChange={(v) => typeof v === "number" && setDefinition(setStartYear(def, v))}
          />
          <SegmentedControl
            value={String(def.options.years)}
            onChange={(v) => setDefinition({ ...def, options: { ...def.options, years: Number(v) } })}
            data={[
              { value: "1", label: "1 year" },
              { value: "10", label: "10 years" },
            ]}
          />
        </Group>
        <Switch
          mt="md"
          label="Include labor-supply responses"
          description="People work more or less when their after-tax pay changes. Uses PolicyEngine's elasticities."
          checked={def.options.labor_supply_responses}
          onChange={(e) =>
            setDefinition({
              ...def,
              options: { ...def.options, labor_supply_responses: e.currentTarget.checked },
            })
          }
        />
      </Card>

      <Card withBorder>
        <Title order={4}>Federal income tax</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Standard deduction by filing status. Leave blank to keep current law. Bracket and rate
          editing comes next.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {FILING_STATUSES.map(({ key, label }) => {
            const path = `gov.irs.deductions.standard.amount.${key}`;
            const current = def.income_tax.parameter_changes[path];
            return (
              <NumberInput
                key={key}
                label={label}
                placeholder="Current law"
                prefix="$"
                thousandSeparator=","
                min={0}
                value={current ? Number(Object.values(current)[0]) : ""}
                onChange={(v) => setDefinition(setParameter(def, path, typeof v === "number" ? v : null))}
              />
            );
          })}
        </SimpleGrid>
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Value-added tax
        </Title>
        <Switch
          label="Enact a national VAT"
          checked={def.vat.enabled}
          onChange={(e) => setDefinition({ ...def, vat: { ...def.vat, enabled: e.currentTarget.checked } })}
        />
        {def.vat.enabled && (
          <Group mt="sm" align="flex-start" grow>
            <NumberInput
              label="Rate"
              suffix="%"
              min={0}
              max={100}
              decimalScale={2}
              value={Math.round(def.vat.rate * 10000) / 100}
              onChange={(v) =>
                typeof v === "number" && setDefinition({ ...def, vat: { ...def.vat, rate: v / 100 } })
              }
            />
            <MultiSelect
              label="Excluded from the tax base"
              data={VAT_EXCLUSIONS}
              value={def.vat.excluded_categories}
              onChange={(excluded_categories) =>
                setDefinition({ ...def, vat: { ...def.vat, excluded_categories } })
              }
            />
          </Group>
        )}
      </Card>

      <Card withBorder>
        <Title order={4}>Spending by agency</Title>
        <Text size="sm" c="dimmed">
          Available once the agency-level budget baseline is loaded.
        </Text>
      </Card>

      <Card withBorder>
        <Title order={4}>National health insurance</Title>
        <Text size="sm" c="dimmed">
          Available once published cost estimates are loaded.
        </Text>
      </Card>

      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>New programs</Title>
          <Button
            variant="light"
            size="xs"
            onClick={() =>
              setPrograms([
                ...def.new_programs,
                { name: "", annual_cost_usd: 0, start_year: null, agency_code: null },
              ])
            }
          >
            Add program
          </Button>
        </Group>
        {def.new_programs.length === 0 && (
          <Text size="sm" c="dimmed">
            No new programs.
          </Text>
        )}
        <Stack>
          {def.new_programs.map((program, i) => {
            const update = (changes: Partial<NewProgram>) =>
              setPrograms(def.new_programs.map((p, j) => (j === i ? { ...p, ...changes } : p)));
            return (
              <Group key={i} align="flex-end">
                <TextInput
                  label="Name"
                  value={program.name}
                  onChange={(e) => update({ name: e.currentTarget.value })}
                  style={{ flex: 1 }}
                />
                <NumberInput
                  label="Annual cost"
                  prefix="$"
                  thousandSeparator=","
                  min={0}
                  value={program.annual_cost_usd}
                  onChange={(v) => update({ annual_cost_usd: typeof v === "number" ? v : 0 })}
                />
                <NumberInput
                  label="Starts"
                  placeholder="First year"
                  min={2026}
                  value={program.start_year ?? ""}
                  onChange={(v) => update({ start_year: typeof v === "number" ? v : null })}
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="lg"
                  aria-label="Remove program"
                  onClick={() => setPrograms(def.new_programs.filter((_, j) => j !== i))}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            );
          })}
        </Stack>
      </Card>

      {startRun.isError && <Alert color="red">{startRun.error.message}</Alert>}
      {run.data && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Results
          </Title>
          {(run.data.status === "queued" || run.data.status === "running") && (
            <Group>
              <Loader size="sm" />
              <Text>{run.data.status === "queued" ? "Waiting for the worker" : "Running"}</Text>
            </Group>
          )}
          {run.data.status === "failed" && (
            <Alert color="red" title="Run failed">
              {run.data.error}
            </Alert>
          )}
          {run.data.status === "succeeded" && <Code block>{JSON.stringify(run.data.result, null, 2)}</Code>}
        </Card>
      )}
    </Stack>
  );
}
