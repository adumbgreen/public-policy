import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconArrowRight, IconPlus, IconSparkles } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { api, type Policy } from "../api";
import { timeAgo } from "../format";
import { POLICY_META } from "../policyMeta";

export function Home() {
  const navigate = useNavigate();
  const scenarios = useQuery({ queryKey: ["scenarios"], queryFn: api.listScenarios });
  const presets = useQuery({ queryKey: ["presets"], queryFn: api.listPresets });
  const create = useMutation({
    mutationFn: (preset: Policy | null) =>
      preset ? api.createScenario(preset.name, [preset]) : api.createScenario("Untitled scenario"),
    onSuccess: (scenario) => navigate(`/s/${scenario.slug}`),
  });

  return (
    <Stack gap={48}>
      <Box className="app-hero">
        <Stack gap="lg" maw={640} pos="relative">
          <Badge
            variant="white"
            color="indigo"
            size="lg"
            leftSection={<IconSparkles size={14} />}
            style={{ alignSelf: "flex-start" }}
          >
            Federal budget simulator
          </Badge>
          <Title order={1} fz={{ base: 34, sm: 48 }} lh={1.05} c="white">
            Rewrite the federal budget. See who it affects.
          </Title>
          <Text fz="lg" c="rgba(255,255,255,0.85)">
            Stack tax and spending policies, then see the effect on the deficit and on households
            at every income level. Every number cites its source.
          </Text>
          <Group>
            <Button
              size="md"
              variant="white"
              color="indigo"
              leftSection={<IconPlus size={18} />}
              loading={create.isPending && create.variables === null}
              onClick={() => create.mutate(null)}
            >
              Start from scratch
            </Button>
            <Button
              size="md"
              variant="subtle"
              color="white"
              component={Link}
              to="/sources"
              rightSection={<IconArrowRight size={16} />}
              style={{ color: "white" }}
            >
              Where the data comes from
            </Button>
          </Group>
        </Stack>
      </Box>

      {!!presets.data?.length && (
        <Stack gap="md">
          <div>
            <Title order={3}>Start from an idea</Title>
            <Text c="dimmed">Pick a preset to open a new scenario with it. You can change anything.</Text>
          </div>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {presets.data.map((preset) => {
              const meta = POLICY_META[preset.type];
              return (
                <Card
                  key={preset.name}
                  className="app-card app-hover"
                  padding="lg"
                  onClick={() => create.mutate(preset)}
                >
                  <Group justify="space-between" mb="md">
                    <ThemeIcon variant="light" color={meta.color} size={42} radius="md">
                      <meta.icon size={22} />
                    </ThemeIcon>
                    {create.isPending && create.variables === preset ? (
                      <Loader size="sm" />
                    ) : (
                      <IconArrowRight size={18} color="var(--mantine-color-dimmed)" />
                    )}
                  </Group>
                  <Text fw={700} fz="lg">
                    {preset.name}
                  </Text>
                  <Text c="dimmed" fz="sm" mt={4}>
                    {preset.description}
                  </Text>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      )}

      <Stack gap="md">
        <Title order={3}>Your scenarios</Title>
        {scenarios.isPending && <Loader />}
        {scenarios.isError && <Text c="red">{scenarios.error.message}</Text>}
        {scenarios.data?.length === 0 && (
          <Card className="app-card" padding="xl">
            <Text c="dimmed" ta="center">
              Nothing saved yet. Start from scratch or pick an idea above.
            </Text>
          </Card>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {scenarios.data?.map((s) => (
            <Card key={s.slug} className="app-card app-hover" padding="lg" component={Link} to={`/s/${s.slug}`}>
              <Text fw={700} fz="lg" lineClamp={1}>
                {s.name}
              </Text>
              {s.description && (
                <Text c="dimmed" fz="sm" lineClamp={2} mt={4}>
                  {s.description}
                </Text>
              )}
              <Group gap={6} mt="md">
                {s.policy_names.length === 0 && (
                  <Badge variant="default" radius="sm" tt="none">
                    No policies
                  </Badge>
                )}
                {s.policy_names.slice(0, 3).map((name, i) => (
                  <Badge key={i} variant="light" radius="sm" maw={200} tt="none" fw={600}>
                    {name}
                  </Badge>
                ))}
                {s.policy_names.length > 3 && (
                  <Badge variant="default" radius="sm">
                    +{s.policy_names.length - 3}
                  </Badge>
                )}
              </Group>
              <Text c="dimmed" fz="xs" mt="md">
                Edited {timeAgo(s.updated_at)}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
