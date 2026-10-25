import {
  Anchor,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { useClipboard, useDisclosure } from "@mantine/hooks";
import { IconArrowLeft, IconCheck, IconInfoCircle, IconLink, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, type Policy, type Scenario, type ScenarioDefinition } from "../api";
import { AddPolicyModal } from "../components/AddPolicyModal";
import { ImpactPanel } from "../components/ImpactPanel";
import { PolicyCard } from "../components/PolicyCard";

type Draft = Pick<Scenario, "name" | "description" | "definition">;

const YEARS = Array.from({ length: 10 }, (_, i) => String(2026 + i));

export function ScenarioEditor() {
  const { slug = "" } = useParams();
  const queryClient = useQueryClient();
  const clipboard = useClipboard({ timeout: 2000 });
  const [pickerOpened, picker] = useDisclosure(false);
  const scenario = useQuery({ queryKey: ["scenario", slug], queryFn: () => api.getScenario(slug) });
  const presets = useQuery({ queryKey: ["presets"], queryFn: api.listPresets });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const savedJson = useRef<string | null>(null);

  // Load the scenario into the draft once per slug. Later saves don't overwrite edits in progress.
  useEffect(() => {
    if (scenario.data && savedJson.current === null) {
      const { name, description, definition } = scenario.data;
      const loaded = { name, description, definition };
      savedJson.current = JSON.stringify(loaded);
      setDraft(loaded);
    }
  }, [scenario.data]);

  const save = useMutation({
    mutationFn: (body: Draft) => api.updateScenario(slug, body),
    onSuccess: (saved, body) => {
      savedJson.current = JSON.stringify(body);
      queryClient.setQueryData(["scenario", slug], saved);
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });

  // Autosave shortly after the user stops editing.
  useEffect(() => {
    if (!draft || JSON.stringify(draft) === savedJson.current || !draft.name.trim()) return;
    const timer = setTimeout(() => save.mutate(draft), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const startRun = useMutation({
    mutationFn: async (body: Draft) => {
      if (JSON.stringify(body) !== savedJson.current) await save.mutateAsync(body);
      return api.startRun(slug);
    },
    onSuccess: (run) => setRunId(run.id),
  });

  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId!),
    enabled: runId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "succeeded" || query.state.data?.status === "failed" ? false : 1500,
  });

  if (scenario.isError) return <Text c="red">{scenario.error.message}</Text>;
  if (!draft) return <Loader />;

  const def = draft.definition;
  const dirty = JSON.stringify(draft) !== savedJson.current;
  const setDefinition = (definition: ScenarioDefinition) => setDraft({ ...draft, definition });
  const setOptions = (options: Partial<ScenarioDefinition["options"]>) =>
    setDefinition({ ...def, options: { ...def.options, ...options } });
  const setPolicies = (policies: Policy[]) => setDefinition({ ...def, policies });

  const addPolicy = (policy: Policy) => {
    setPolicies([...def.policies, policy]);
    setExpanded(def.policies.length);
  };
  const removePolicy = (index: number) => {
    setPolicies(def.policies.filter((_, j) => j !== index));
    if (expanded === index) setExpanded(null);
    else if (expanded !== null && expanded > index) setExpanded(expanded - 1);
  };

  const saveStatus = save.isError
    ? { text: "Couldn't save", color: "red" }
    : save.isPending || dirty
      ? { text: "Saving…", color: "dimmed" }
      : { text: "Saved", color: "dimmed" };

  return (
    <Stack gap="xl">
      <Group justify="space-between">
        <Anchor component={Link} to="/" c="dimmed" fz="sm">
          <Group gap={4}>
            <IconArrowLeft size={16} />
            All scenarios
          </Group>
        </Anchor>
        <Group gap="sm">
          <Group gap={4}>
            {saveStatus.text === "Saved" && <IconCheck size={14} color="var(--mantine-color-teal-6)" />}
            <Text fz="sm" c={saveStatus.color}>
              {saveStatus.text}
            </Text>
          </Group>
          <Button
            variant="default"
            leftSection={clipboard.copied ? <IconCheck size={16} /> : <IconLink size={16} />}
            onClick={() => clipboard.copy(window.location.href)}
          >
            {clipboard.copied ? "Link copied" : "Share"}
          </Button>
        </Group>
      </Group>

      <Box>
        <TextInput
          variant="unstyled"
          className="app-title-input"
          aria-label="Scenario name"
          placeholder="Name your scenario"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
        />
        <Textarea
          variant="unstyled"
          aria-label="Description"
          placeholder="Add a description"
          autosize
          minRows={1}
          c="dimmed"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })}
        />
      </Box>

      <Card className="app-card" padding="md">
        <Group gap="xl" wrap="wrap">
          <Group gap="xs">
            <Text fz="sm" fw={600}>
              Horizon
            </Text>
            <SegmentedControl
              radius="xl"
              value={String(def.options.years)}
              onChange={(v) => setOptions({ years: Number(v) })}
              data={[
                { value: "1", label: "1 year" },
                { value: "10", label: "10 years" },
              ]}
            />
          </Group>
          <Group gap="xs">
            <Text fz="sm" fw={600}>
              Starting
            </Text>
            <Select
              w={100}
              radius="xl"
              allowDeselect={false}
              data={YEARS}
              value={String(def.options.start_year)}
              onChange={(v) => v && setOptions({ start_year: Number(v) })}
            />
          </Group>
          <Group gap={6}>
            <Switch
              label="Behavioral responses"
              checked={def.options.labor_supply_responses}
              onChange={(e) => setOptions({ labor_supply_responses: e.currentTarget.checked })}
            />
            <Tooltip
              multiline
              w={260}
              label="People may work more or less when their after-tax pay changes. Uses PolicyEngine's labor-supply elasticities."
            >
              <IconInfoCircle size={16} color="var(--mantine-color-dimmed)" />
            </Tooltip>
          </Group>
        </Group>
      </Card>

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <Title order={3}>Policies</Title>
                <Text c="dimmed" fw={600}>
                  {def.policies.length}
                </Text>
              </Group>
              {def.policies.length > 0 && (
                <Button variant="gradient" leftSection={<IconPlus size={16} />} onClick={picker.open}>
                  Add policy
                </Button>
              )}
            </Group>

            {def.policies.length === 0 && (
              <Card
                className="app-hover"
                padding={48}
                radius="lg"
                onClick={picker.open}
                style={{ border: "2px dashed var(--mantine-color-indigo-3)", background: "var(--mantine-color-indigo-light)" }}
              >
                <Stack align="center" gap="xs">
                  <IconPlus size={32} color="var(--mantine-color-indigo-6)" />
                  <Text fw={700} fz="lg">
                    Add your first policy
                  </Text>
                  <Text c="dimmed" ta="center" maw={420}>
                    Change a tax, add a VAT, or define your own program and its cost.
                  </Text>
                </Stack>
              </Card>
            )}

            {def.policies.map((policy, i) => (
              <PolicyCard
                key={i}
                policy={policy}
                expanded={expanded === i}
                onToggle={() => setExpanded(expanded === i ? null : i)}
                onChange={(changed) => setPolicies(def.policies.map((p, j) => (j === i ? changed : p)))}
                onRemove={() => removePolicy(i)}
              />
            ))}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <ImpactPanel
            definition={def}
            run={run.data}
            starting={startRun.isPending}
            onRun={() => startRun.mutate(draft)}
          />
        </Grid.Col>
      </Grid>

      <AddPolicyModal
        opened={pickerOpened}
        onClose={picker.close}
        onAdd={addPolicy}
        presets={presets.data ?? []}
        hasVat={def.policies.some((p) => p.type === "vat")}
      />
    </Stack>
  );
}
