import {
  ActionIcon,
  Badge,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";

import type { CustomPolicy, IncomeTaxPolicy, Policy, VatPolicy } from "../api";

export const POLICY_TYPE_LABELS: Record<Policy["type"], string> = {
  custom: "Custom",
  income_tax: "Income tax change",
  vat: "Value-added tax",
  spending_change: "Agency spending change",
  published_estimate: "Published estimate",
};

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

type Props<P extends Policy> = {
  policy: P;
  onChange: (policy: P) => void;
};

export function PolicyCard({ policy, onChange, onRemove }: Props<Policy> & { onRemove: () => void }) {
  return (
    <Card withBorder>
      <Group align="flex-end" mb="xs">
        <TextInput
          label="Policy name"
          value={policy.name}
          onChange={(e) => onChange({ ...policy, name: e.currentTarget.value })}
          style={{ flex: 1 }}
        />
        <Badge variant="light" mb={8}>
          {POLICY_TYPE_LABELS[policy.type]}
        </Badge>
        <ActionIcon variant="subtle" color="red" size="lg" aria-label="Remove policy" onClick={onRemove}>
          <IconTrash size={18} />
        </ActionIcon>
      </Group>
      <Textarea
        label="Description"
        autosize
        minRows={1}
        mb="sm"
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
    </Card>
  );
}

function CustomFields({ policy, onChange }: Props<CustomPolicy>) {
  return (
    <Stack>
      <Group align="flex-end" grow>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Affects
          </Text>
          <SegmentedControl
            value={policy.category}
            onChange={(v) => onChange({ ...policy, category: v as CustomPolicy["category"] })}
            data={[
              { value: "spending", label: "Spending" },
              { value: "revenue", label: "Revenue" },
            ]}
          />
        </Stack>
        <NumberInput
          label="Change per year"
          description="Negative for a cut"
          prefix="$"
          thousandSeparator=","
          value={policy.annual_change_usd}
          onChange={(v) => onChange({ ...policy, annual_change_usd: typeof v === "number" ? v : 0 })}
        />
        <NumberInput
          label="Starts"
          description="Blank for the first year"
          min={2026}
          value={policy.start_year ?? ""}
          onChange={(v) => onChange({ ...policy, start_year: typeof v === "number" ? v : null })}
        />
      </Group>
      <Switch
        label="Grow with inflation"
        checked={policy.index_to_inflation}
        onChange={(e) => onChange({ ...policy, index_to_inflation: e.currentTarget.checked })}
      />
      <TextInput
        label="Source"
        placeholder="Link to where this figure comes from"
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
    <Stack>
      <Text size="sm" c="dimmed">
        Standard deduction by filing status. Leave blank to keep current law. Editing brackets,
        rates and credits comes next.
      </Text>
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
        checked={policy.index_to_inflation}
        onChange={(e) => onChange({ ...policy, index_to_inflation: e.currentTarget.checked })}
      />
    </Stack>
  );
}

function VatFields({ policy, onChange }: Props<VatPolicy>) {
  return (
    <Group align="flex-start" grow>
      <NumberInput
        label="Rate"
        suffix="%"
        min={0}
        max={100}
        decimalScale={2}
        value={Math.round(policy.rate * 10000) / 100}
        onChange={(v) => typeof v === "number" && onChange({ ...policy, rate: v / 100 })}
      />
      <MultiSelect
        label="Excluded from the tax base"
        data={VAT_EXCLUSIONS}
        value={policy.excluded_categories}
        onChange={(excluded_categories) => onChange({ ...policy, excluded_categories })}
      />
    </Group>
  );
}
