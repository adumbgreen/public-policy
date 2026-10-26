import { Alert, Badge, Box, Button, Card, Divider, Group, Loader, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconBolt, IconCalculator } from "@tabler/icons-react";

import type { ByYear, EstimateResult, Run } from "../api";
import { formatSignedUsd, formatUsd } from "../format";
import { POLICY_META } from "../policyMeta";

type Props = {
  result: EstimateResult | undefined;
  exact: boolean;
  refreshing: boolean;
  run: Run | undefined;
  starting: boolean;
  onRun: () => void;
};

const total = (values: ByYear) => Object.values(values).reduce((sum, v) => sum + v, 0);

const STATUS_LABELS = {
  pending: "Needs a simulation run",
  not_modeled: "Not modeled yet",
} as const;

function Row({ label, value }: { label: string; value: number }) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text fz="sm" c="dimmed">
        {label}
      </Text>
      <Text fz="sm" fw={600}>
        {formatSignedUsd(value)}
      </Text>
    </Group>
  );
}

export function ImpactPanel({ result, exact, refreshing, run, starting, onRun }: Props) {
  const running = starting || run?.status === "queued" || run?.status === "running";
  const pending = result?.policies.some((p) => p.status === "pending") ?? false;
  const years = result?.years ?? [];
  const horizon = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : `${years[0] ?? ""}`;

  return (
    <Card className="app-card" padding="lg" style={{ position: "sticky", top: 88 }}>
      <Stack gap="lg" style={{ opacity: refreshing ? 0.6 : 1, transition: "opacity 150ms" }}>
        <Group justify="space-between">
          <Text fw={700} fz="lg">
            Impact
          </Text>
          {result &&
            (result.complete ? (
              <Badge variant="light" color="indigo">
                {exact ? "Simulated" : "Calculated"}
              </Badge>
            ) : (
              <Badge variant="light" color="gray">
                Partial
              </Badge>
            ))}
        </Group>

        {!result && <Loader size="sm" />}
        {result && (
          <>
            <Box>
              <Text c="dimmed" fz="sm">
                Change in the deficit, {horizon}
              </Text>
              <Text className="app-big-number">{formatSignedUsd(total(result.totals.deficit_change))}</Text>
              {!result.complete && (
                <Text c="dimmed" fz="xs" mt={6}>
                  Doesn't include policies marked below.
                </Text>
              )}
            </Box>

            <Box>
              <Row label="Revenue" value={total(result.totals.revenue_change)} />
              <Row label="Spending" value={total(result.totals.outlay_change)} />
              <Row label="Interest on debt" value={total(result.totals.net_interest_change)} />
              <Divider my={6} />
              <Text fz="xs" c="dimmed">
                CBO baseline deficit for the same years: {formatUsd(total(result.baseline.deficit))}
              </Text>
            </Box>

            {result.policies.length > 0 && (
              <Stack gap={8}>
                <Text fz="sm" fw={600}>
                  By policy, effect on the deficit
                </Text>
                {result.policies.map((p, i) => {
                  const meta = POLICY_META[p.type];
                  const effect = total(p.outlay_change) - total(p.revenue_change);
                  return (
                    <Group key={i} justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                        <ThemeIcon variant="light" color={meta.color} size="sm">
                          <meta.icon size={12} />
                        </ThemeIcon>
                        <Text fz="sm" truncate>
                          {p.name}
                        </Text>
                      </Group>
                      {p.status === "pending" || p.status === "not_modeled" ? (
                        <Text fz="xs" c="dimmed" ta="right" style={{ flexShrink: 0 }}>
                          {STATUS_LABELS[p.status]}
                        </Text>
                      ) : (
                        <Text fz="sm" fw={600} style={{ flexShrink: 0 }}>
                          {formatSignedUsd(effect)}
                        </Text>
                      )}
                    </Group>
                  );
                })}
              </Stack>
            )}
          </>
        )}

        {pending && (
          <Button
            size="md"
            variant="gradient"
            fullWidth
            leftSection={running ? undefined : <IconBolt size={18} />}
            loading={running}
            onClick={onRun}
          >
            Run simulation
          </Button>
        )}
        {running && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text fz="sm" c="dimmed">
              {run?.progress ?? (run?.status === "running" ? "Starting" : "Queued")}
            </Text>
          </Group>
        )}
        {pending && !running && (
          <Text fz="xs" c="dimmed">
            Income tax changes run on PolicyEngine's model of US households. It takes a few minutes per
            year; finished runs are saved.
          </Text>
        )}
        {run?.status === "failed" && (
          <Alert color="orange" variant="light" title="The simulation failed" icon={<IconCalculator size={18} />}>
            <Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>
              {run.error?.split("\n").slice(-3).join("\n")}
            </Text>
          </Alert>
        )}

        {result?.notes && (
          <Stack gap={4}>
            {result.notes.map((note) => (
              <Text key={note} fz="xs" c="dimmed">
                {note}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
