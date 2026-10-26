import { BarChart } from "@mantine/charts";
import {
  Box,
  Button,
  Card,
  Collapse,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import { useState } from "react";
import { Rectangle, type RectangleProps } from "recharts";

import type { EstimateResult } from "../api";
import { formatSignedUsd } from "../format";

// Diverging pair, validated for both color schemes with the dataviz palette checker.
const POLES = {
  light: { down: "#2a78d6", up: "#e34948" },
  dark: { down: "#3987e5", up: "#e66767" },
};

function usePoles() {
  return POLES[useComputedColorScheme("light")];
}

// Rounded at the data end, square at the zero baseline, for bars on either side of zero.
function SignedBar(props: RectangleProps & { value?: number | number[] }) {
  const value = Array.isArray(props.value) ? props.value[1] - props.value[0] : (props.value ?? 0);
  const radius: [number, number, number, number] = value < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0];
  return <Rectangle {...props} radius={radius} />;
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <Group gap="md">
      {items.map((item) => (
        <Group key={item.label} gap={6}>
          <Box w={10} h={10} style={{ borderRadius: 2, background: item.color }} />
          <Text fz="xs" c="dimmed">
            {item.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

function SignedBarChart({
  data,
  dataKey,
  label,
  valueFormatter,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  label: string;
  valueFormatter: (value: number) => string;
}) {
  const poles = usePoles();
  return (
    <BarChart
      h={240}
      data={data}
      dataKey={dataKey}
      series={[{ name: "value", label }]}
      getBarColor={(value) => (value > 0 ? poles.up : poles.down)}
      maxBarWidth={24}
      gridAxis="y"
      strokeDasharray="0"
      tickLine="none"
      valueFormatter={valueFormatter}
      referenceLines={[{ y: 0, color: "gray.5" }]}
      barProps={{ shape: (props: unknown) => <SignedBar {...(props as RectangleProps)} /> }}
    />
  );
}

const billions = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(value).toFixed(0)}B`;
const dollars = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;

export function Results({ result }: { result: EstimateResult }) {
  const poles = usePoles();
  const [showTable, setShowTable] = useState(false);
  const [showDecileTable, setShowDecileTable] = useState(false);
  const distributionYears = Object.keys(result.distribution ?? {});
  const [year, setYear] = useState<string | null>(null);
  const shownYear = year && distributionYears.includes(year) ? year : distributionYears[0];
  const deciles = shownYear ? result.distribution?.[shownYear] : undefined;
  const { totals, years } = result;

  return (
    <SimpleGrid cols={{ base: 1, md: deciles ? 2 : 1 }}>
      <Card className="app-card" padding="lg">
        <Stack gap="sm">
          <div>
            <Title order={4}>Change in the deficit by year</Title>
            <Text fz="sm" c="dimmed">
              Billions of dollars, including interest on added debt
            </Text>
          </div>
          <Legend
            items={[
              { color: poles.up, label: "Adds to the deficit" },
              { color: poles.down, label: "Reduces the deficit" },
            ]}
          />
          <SignedBarChart
            data={years.map((y) => ({ year: String(y), value: totals.deficit_change[y] / 1e9 }))}
            dataKey="year"
            label="Change in deficit"
            valueFormatter={billions}
          />
          <Group justify="flex-end">
            <Button variant="subtle" size="xs" onClick={() => setShowTable((v) => !v)}>
              {showTable ? "Hide table" : "Show table"}
            </Button>
          </Group>
          <Collapse expanded={showTable}>
            <Table fz="xs" striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Year</Table.Th>
                  <Table.Th ta="right">Revenue</Table.Th>
                  <Table.Th ta="right">Spending</Table.Th>
                  <Table.Th ta="right">Interest</Table.Th>
                  <Table.Th ta="right">Deficit</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {years.map((y) => (
                  <Table.Tr key={y}>
                    <Table.Td>{y}</Table.Td>
                    <Table.Td ta="right">{formatSignedUsd(totals.revenue_change[y])}</Table.Td>
                    <Table.Td ta="right">{formatSignedUsd(totals.outlay_change[y])}</Table.Td>
                    <Table.Td ta="right">{formatSignedUsd(totals.net_interest_change[y])}</Table.Td>
                    <Table.Td ta="right" fw={600}>
                      {formatSignedUsd(totals.deficit_change[y])}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Collapse>
        </Stack>
      </Card>

      {deciles && (
        <Card className="app-card" padding="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={4}>Who it affects</Title>
                <Text fz="sm" c="dimmed">
                  Average change in federal income tax per household, by income decile
                </Text>
              </div>
              {distributionYears.length > 1 && (
                <Select
                  w={96}
                  size="xs"
                  allowDeselect={false}
                  aria-label="Year"
                  data={distributionYears}
                  value={shownYear}
                  onChange={setYear}
                />
              )}
            </Group>
            <Legend
              items={[
                { color: poles.down, label: "Pays less" },
                { color: poles.up, label: "Pays more" },
              ]}
            />
            <SignedBarChart
              data={deciles.map((row) => ({ decile: String(row.decile), value: row.average_tax_change }))}
              dataKey="decile"
              label="Average change"
              valueFormatter={dollars}
            />
            <Text fz="xs" c="dimmed">
              Deciles rank households by market income, from lowest (1) to highest (10). Each holds a
              tenth of households. Covers income tax changes only.
            </Text>
            <Group justify="flex-end">
              <Button variant="subtle" size="xs" onClick={() => setShowDecileTable((v) => !v)}>
                {showDecileTable ? "Hide table" : "Show table"}
              </Button>
            </Group>
            <Collapse expanded={showDecileTable}>
              <Table fz="xs" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Decile</Table.Th>
                    <Table.Th ta="right">Average per household</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                    <Table.Th ta="right">Share paying less</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {deciles.map((row) => (
                    <Table.Tr key={row.decile}>
                      <Table.Td>{row.decile}</Table.Td>
                      <Table.Td ta="right">{dollars(row.average_tax_change)}</Table.Td>
                      <Table.Td ta="right">{formatSignedUsd(row.total_tax_change)}</Table.Td>
                      <Table.Td ta="right">{Math.round(row.share_with_tax_cut * 100)}%</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Collapse>
          </Stack>
        </Card>
      )}
    </SimpleGrid>
  );
}
