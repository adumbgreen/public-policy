import {
  ActionIcon,
  Badge,
  Box,
  Card,
  Chip,
  Collapse,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import type { CustomPolicy, IncomeTaxPolicy, Policy, VatPolicy } from "../api";
import { POLICY_META, summarize } from "../policyMeta";

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

const YEARS = Array.from({ length: 10 }, (_, i) => String(2026 + i));

type Props<P extends Policy> = {
  policy: P;
  onChange: (policy: P) => void;
};

type CardProps = Props<Policy> & {
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
};

export function PolicyCard({ policy, onChange, expanded, onToggle, onRemove }: CardProps) {
  const meta = POLICY_META[policy.type];

  return (
    <Card
      className="app-card"
      padding={0}
      style={{ borderLeft: `4px solid var(--mantine-color-${meta.color}-filled)` }}
    >
      <Group wrap="nowrap" p="md" gap="md">
        <UnstyledButton onClick={onToggle} style={{ flex: 1, minWidth: 0 }} aria-expanded={expanded}>
          <Group wrap="nowrap" gap="md">
            <ThemeIcon variant="light" color={meta.color} size={44} radius="md">
              <meta.icon size={24} />
            </ThemeIcon>
            <Box style={{ minWidth: 0 }}>
              <Text fw={700} truncate>
                {policy.name || "Untitled policy"}
              </Text>
              <Text fz="sm" c="dimmed" truncate>
                {summarize(policy)}
              </Text>
            </Box>
          </Group>
        </UnstyledButton>
        <Badge variant="light" color={meta.color} visibleFrom="sm">
          {meta.label}
        </Badge>
        <ActionIcon variant="subtle" color="gray" onClick={onToggle} aria-label={expanded ? "Collapse" : "Edit"}>
          <IconChevronDown
            size={18}
            style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}
          />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" onClick={onRemove} aria-label="Remove policy">
          <IconTrash size={18} />
        </ActionIcon>
      </Group>
      <Collapse expanded={expanded}>
        <Stack px="md" pb="lg" pt={4} gap="md">
          <Group grow align="flex-start">
            <TextInput
              label="Name"
              value={policy.name}
              onChange={(e) => onChange({ ...policy, name: e.currentTarget.value })}
            />
          </Group>
          <Textarea
            label="What it does"
            placeholder="Optional notes, assumptions or links"
            autosize
            minRows={1}
            value={policy.description}
            onChange={(e) => onChange({ ...policy, description: e.currentTarget.value })}
          />
          {policy.type === "custom" && <CustomFields policy={policy} onChange={onChange} />}
          {policy.type === "income_tax" && <IncomeTaxFields policy={policy} onChange={onChange} />}
          {policy.type === "vat" && <VatFields policy={policy} onChange={onChange} />}
          {(policy.type === "spending_change" || policy.type === "published_estimate") && (
            <Text size="sm" c="dimmed">
              This policy type needs the budget data, which isn't loaded yet.
            </Text>
          )}
        </Stack>
      </Collapse>
    </Card>
  );
}

const DIRECTIONS = [
  { value: "spending+", label: "Adds spending", category: "spending", sign: 1 },
  { value: "spending-", label: "Cuts spending", category: "spending", sign: -1 },
  { value: "revenue+", label: "Raises revenue", category: "revenue", sign: 1 },
  { value: "revenue-", label: "Lowers revenue", category: "revenue", sign: -1 },
] as const;

function CustomFields({ policy, onChange }: Props<CustomPolicy>) {
  const amount = Math.abs(policy.annual_change_usd);
  // A zero amount has no sign, so remember the chosen direction locally.
  const [sign, setSign] = useState(policy.annual_change_usd < 0 ? -1 : 1);
  const direction = `${policy.category}${sign < 0 ? "-" : "+"}`;

  return (
    <Stack gap="md">
      <div>
        <Text fz="sm" fw={500} mb={6}>
          Effect on the budget
        </Text>
        <Chip.Group
          value={direction}
          onChange={(value) => {
            const d = DIRECTIONS.find((x) => x.value === value)!;
            setSign(d.sign);
            onChange({ ...policy, category: d.category, annual_change_usd: d.sign * amount });
          }}
        >
          <Group gap="xs">
            {DIRECTIONS.map((d) => (
              <Chip key={d.value} value={d.value} variant="light">
                {d.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </div>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <NumberInput
          label="Amount per year"
          prefix="$"
          thousandSeparator=","
          min={0}
          allowNegative={false}
          value={amount}
          onChange={(v) => onChange({ ...policy, annual_change_usd: sign * (typeof v === "number" ? v : 0) })}
        />
        <Select
          label="Starts in"
          placeholder="First year of the scenario"
          clearable
          data={YEARS}
          value={policy.start_year ? String(policy.start_year) : null}
          onChange={(v) => onChange({ ...policy, start_year: v ? Number(v) : null })}
        />
      </SimpleGrid>
      <Switch
        label="Grows with inflation"
        checked={policy.index_to_inflation}
        onChange={(e) => onChange({ ...policy, index_to_inflation: e.currentTarget.checked })}
      />
      <TextInput
        label="Source"
        placeholder="Link to where this number comes from"
        value={policy.source_url ?? ""}
        onChange={(e) => onChange({ ...policy, source_url: e.currentTarget.value || null })}
      />
    </Stack>
  );
}

function IncomeTaxFields({ policy, onChange }: Props<IncomeTaxPolicy>) {
  const setValue = (path: string, value: number | null) => {
    const values = { ...policy.parameter_values };
    if (value === null) delete values[path];
    else values[path] = value;
    onChange({ ...policy, parameter_values: values });
  };

  return (
    <Stack gap="md">
      <div>
        <Text fz="sm" fw={500}>
          Standard deduction
        </Text>
        <Text fz="xs" c="dimmed">
          Blank keeps current law. Brackets, rates and credits are coming next.
        </Text>
      </div>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {FILING_STATUSES.map(({ key, label }) => {
          const path = `gov.irs.deductions.standard.amount.${key}`;
          const value = policy.parameter_values[path];
          return (
            <NumberInput
              key={key}
              label={label}
              placeholder="Current law"
              prefix="$"
              thousandSeparator=","
              min={0}
              value={typeof value === "number" ? value : ""}
              onChange={(v) => setValue(path, typeof v === "number" ? v : null)}
            />
          );
        })}
      </SimpleGrid>
      <Switch
        label="Index to inflation"
        description="Raise these amounts each year, the same way current law does"
        checked={policy.index_to_inflation}
        onChange={(e) => onChange({ ...policy, index_to_inflation: e.currentTarget.checked })}
      />
    </Stack>
  );
}

function VatFields({ policy, onChange }: Props<VatPolicy>) {
  const percent = Math.round(policy.rate * 10000) / 100;

  return (
    <Stack gap="lg">
      <div>
        <Group justify="space-between" mb={6}>
          <Text fz="sm" fw={500}>
            Rate
          </Text>
          <Text fw={800} fz="xl" c="teal">
            {percent}%
          </Text>
        </Group>
        <Slider
          color="teal"
          min={0}
          max={25}
          step={0.5}
          value={percent}
          onChange={(v) => onChange({ ...policy, rate: v / 100 })}
          marks={[0, 5, 10, 15, 20, 25].map((v) => ({ value: v, label: `${v}%` }))}
          label={(v) => `${v}%`}
          mb="md"
        />
      </div>
      <div>
        <Text fz="sm" fw={500} mb={6}>
          Exclude from the tax
        </Text>
        <Chip.Group
          multiple
          value={policy.excluded_categories}
          onChange={(excluded_categories) => onChange({ ...policy, excluded_categories })}
        >
          <Group gap="xs">
            {VAT_EXCLUSIONS.map((c) => (
              <Chip key={c.value} value={c.value} color="teal" variant="light">
                {c.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </div>
    </Stack>
  );
}
