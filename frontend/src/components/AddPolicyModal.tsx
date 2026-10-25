import { Badge, Card, Group, Modal, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";

import type { Policy } from "../api";
import { POLICY_META } from "../policyMeta";

const BLANK_POLICIES: Record<"custom" | "income_tax" | "vat", Policy> = {
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
    rate: 0.05,
    excluded_categories: [],
  },
};

type TileProps = {
  type: Policy["type"];
  title: string;
  body: string;
  disabledReason?: string;
  onClick: () => void;
};

function Tile({ type, title, body, disabledReason, onClick }: TileProps) {
  const meta = POLICY_META[type];
  return (
    <Card
      className="app-card app-hover app-tile"
      padding="md"
      data-disabled={disabledReason ? true : undefined}
      onClick={disabledReason ? undefined : onClick}
    >
      <Group align="flex-start" wrap="nowrap">
        <ThemeIcon variant="light" color={meta.color} size={40} radius="md">
          <meta.icon size={22} />
        </ThemeIcon>
        <div style={{ flex: 1 }}>
          <Group gap={6} justify="space-between">
            <Text fw={700}>{title}</Text>
            {disabledReason && (
              <Badge size="xs" variant="default">
                {disabledReason}
              </Badge>
            )}
          </Group>
          <Text fz="sm" c="dimmed" mt={2}>
            {body}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

type Props = {
  opened: boolean;
  onClose: () => void;
  onAdd: (policy: Policy) => void;
  presets: Policy[];
  hasVat: boolean;
};

export function AddPolicyModal({ opened, onClose, onAdd, presets, hasVat }: Props) {
  const add = (policy: Policy) => {
    onAdd(structuredClone(policy));
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      radius="lg"
      title="Add a policy"
      styles={{ title: { fontSize: 22, fontWeight: 750, letterSpacing: "-0.025em" } }}
    >
      <Stack gap="xl">
        <Stack gap="sm">
          <Text fw={600} c="dimmed" fz="xs" tt="uppercase">
            Build your own
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {(["custom", "income_tax", "vat"] as const).map((type) => (
              <Tile
                key={type}
                type={type}
                title={POLICY_META[type].label}
                body={POLICY_META[type].blurb}
                disabledReason={type === "vat" && hasVat ? "Already added" : undefined}
                onClick={() => add(BLANK_POLICIES[type])}
              />
            ))}
            {(["spending_change", "published_estimate"] as const).map((type) => (
              <Tile
                key={type}
                type={type}
                title={POLICY_META[type].label}
                body={POLICY_META[type].blurb}
                disabledReason="Needs budget data"
                onClick={() => {}}
              />
            ))}
          </SimpleGrid>
        </Stack>
        {presets.length > 0 && (
          <Stack gap="sm">
            <Text fw={600} c="dimmed" fz="xs" tt="uppercase">
              Presets
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {presets.map((preset) => (
                <Tile
                  key={preset.name}
                  type={preset.type}
                  title={preset.name}
                  body={preset.description}
                  disabledReason={preset.type === "vat" && hasVat ? "VAT already added" : undefined}
                  onClick={() => add(preset)}
                />
              ))}
            </SimpleGrid>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
