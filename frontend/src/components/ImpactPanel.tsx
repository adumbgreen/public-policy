import { Alert, Box, Button, Card, Code, Divider, Group, Loader, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconBolt, IconCalculator, IconChartBar, IconHome, IconUsers } from "@tabler/icons-react";

import type { Run, ScenarioDefinition } from "../api";
import { formatSignedUsd } from "../format";
import { POLICY_META } from "../policyMeta";

type Props = {
  definition: ScenarioDefinition;
  run: Run | undefined;
  starting: boolean;
  onRun: () => void;
};

const COMING = [
  { icon: IconChartBar, label: "Deficit change, year by year" },
  { icon: IconUsers, label: "Who gains and who pays, by income group" },
  { icon: IconHome, label: "What it means for an example household" },
];

export function ImpactPanel({ definition, run, starting, onRun }: Props) {
  const { start_year, years } = definition.options;
  const horizon = years === 1 ? `${start_year}` : `${start_year}–${start_year + years - 1}`;
  const custom = definition.policies.filter((p) => p.type === "custom");
  const modeled = definition.policies.filter((p) => p.type !== "custom");
  const spending = custom.filter((p) => p.category === "spending").reduce((t, p) => t + p.annual_change_usd, 0);
  const revenue = custom.filter((p) => p.category === "revenue").reduce((t, p) => t + p.annual_change_usd, 0);
  const busy = starting || run?.status === "queued" || run?.status === "running";

  return (
    <Card className="app-card" padding="lg" style={{ position: "sticky", top: 88 }}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Text fw={700} fz="lg">
            Impact
          </Text>
          <Text c="dimmed" fz="sm">
            {horizon}
          </Text>
        </Group>

        <Box>
          <Text c="dimmed" fz="sm">
            Change in the deficit
          </Text>
          <Text className="app-big-number" c="dimmed">
            —
          </Text>
          <Text c="dimmed" fz="xs" mt={6}>
            Appears here once the simulation engine is connected.
          </Text>
        </Box>

        {custom.length > 0 && (
          <Box>
            <Text fz="sm" fw={600} mb={6}>
              Amounts you entered, first year
            </Text>
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">
                Spending
              </Text>
              <Text fz="sm" fw={600}>
                {formatSignedUsd(spending)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">
                Revenue
              </Text>
              <Text fz="sm" fw={600}>
                {formatSignedUsd(revenue)}
              </Text>
            </Group>
            <Divider my={6} />
            <Group justify="space-between">
              <Text fz="sm" c="dimmed">
                Deficit effect
              </Text>
              <Text fz="sm" fw={700}>
                {formatSignedUsd(spending - revenue)}
              </Text>
            </Group>
          </Box>
        )}

        {modeled.length > 0 && (
          <Box>
            <Text fz="sm" fw={600} mb={6}>
              Calculated by the model
            </Text>
            <Stack gap={6}>
              {modeled.map((p, i) => {
                const meta = POLICY_META[p.type];
                return (
                  <Group key={i} gap="xs" wrap="nowrap">
                    <ThemeIcon variant="light" color={meta.color} size="sm">
                      <meta.icon size={12} />
                    </ThemeIcon>
                    <Text fz="sm" truncate>
                      {p.name}
                    </Text>
                  </Group>
                );
              })}
            </Stack>
          </Box>
        )}

        <Button
          size="md"
          variant="gradient"
          fullWidth
          leftSection={busy ? undefined : <IconBolt size={18} />}
          loading={busy}
          disabled={definition.policies.length === 0}
          onClick={onRun}
        >
          Run simulation
        </Button>

        {run?.status === "failed" && (
          <Alert color="orange" variant="light" title="Results aren't available yet" icon={<IconCalculator size={18} />}>
            <Text fz="sm">{run.error}</Text>
          </Alert>
        )}
        {run?.status === "succeeded" && <Code block>{JSON.stringify(run.result, null, 2)}</Code>}
        {busy && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text fz="sm" c="dimmed">
              {run?.status === "running" ? "Simulating households…" : "Queued"}
            </Text>
          </Group>
        )}

        <Box>
          <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={8}>
            What you'll see
          </Text>
          <Stack gap={8}>
            {COMING.map(({ icon: Icon, label }) => (
              <Group key={label} gap="xs" wrap="nowrap">
                <Icon size={16} color="var(--mantine-color-indigo-5)" />
                <Text fz="sm" c="dimmed">
                  {label}
                </Text>
              </Group>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Card>
  );
}
