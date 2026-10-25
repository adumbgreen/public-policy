import {
  Alert,
  Button,
  Card,
  Code,
  Group,
  Loader,
  Menu,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api, type Policy, type Scenario, type ScenarioDefinition } from "../api";
import { POLICY_TYPE_LABELS, PolicyCard } from "../components/PolicyCard";

type Draft = Pick<Scenario, "name" | "description" | "definition">;

const NEW_POLICIES = {
  custom: {
    type: "custom",
    name: "New policy",
    description: "",
    category: "spending",
    annual_change_usd: 0,
    start_year: null,
    index_to_inflation: false,
    source_url: null,
  },
  income_tax: {
    type: "income_tax",
    name: "Income tax change",
    description: "",
    parameter_values: {},
    index_to_inflation: true,
  },
  vat: {
    type: "vat",
    name: "Value-added tax",
    description: "",
    rate: 0,
    excluded_categories: [],
  },
} satisfies Record<string, Policy>;

export function ScenarioEditor() {
  const { slug = "" } = useParams();
  const queryClient = useQueryClient();
  const clipboard = useClipboard();
  const scenario = useQuery({ queryKey: ["scenario", slug], queryFn: () => api.getScenario(slug) });
  const presets = useQuery({ queryKey: ["presets"], queryFn: api.listPresets });
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
  const setPolicies = (policies: Policy[]) => setDefinition({ ...def, policies });
  const addPolicy = (policy: Policy) => setPolicies([...def.policies, structuredClone(policy)]);
  const hasVat = def.policies.some((p) => p.type === "vat");

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
            onChange={(v) =>
              typeof v === "number" && setDefinition({ ...def, options: { ...def.options, start_year: v } })
            }
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

      <Group justify="space-between">
        <Title order={3}>Policies</Title>
        <Menu position="bottom-end" width={260}>
          <Menu.Target>
            <Button variant="light">Add policy</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => addPolicy(NEW_POLICIES.custom)}>Custom policy</Menu.Item>
            <Menu.Item onClick={() => addPolicy(NEW_POLICIES.income_tax)}>
              {POLICY_TYPE_LABELS.income_tax}
            </Menu.Item>
            <Menu.Item disabled={hasVat} onClick={() => addPolicy(NEW_POLICIES.vat)}>
              {POLICY_TYPE_LABELS.vat}
            </Menu.Item>
            <Menu.Item disabled>{POLICY_TYPE_LABELS.spending_change} (needs budget data)</Menu.Item>
            <Menu.Item disabled>{POLICY_TYPE_LABELS.published_estimate} (needs budget data)</Menu.Item>
            {!!presets.data?.length && <Menu.Label>Presets</Menu.Label>}
            {presets.data?.map((preset) => (
              <Menu.Item
                key={preset.name}
                disabled={preset.type === "vat" && hasVat}
                onClick={() => addPolicy(preset)}
              >
                {preset.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>
      {def.policies.length === 0 && (
        <Text c="dimmed">No policies yet. Add one to compare it against current law.</Text>
      )}
      {def.policies.map((policy, i) => (
        <PolicyCard
          key={i}
          policy={policy}
          onChange={(changed) => setPolicies(def.policies.map((p, j) => (j === i ? changed : p)))}
          onRemove={() => setPolicies(def.policies.filter((_, j) => j !== i))}
        />
      ))}

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
