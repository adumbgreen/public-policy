import { Anchor, Button, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api";

export function ScenarioList() {
  const navigate = useNavigate();
  const scenarios = useQuery({ queryKey: ["scenarios"], queryFn: api.listScenarios });
  const create = useMutation({
    mutationFn: () => api.createScenario("Untitled scenario"),
    onSuccess: (scenario) => navigate(`/s/${scenario.slug}`),
  });

  return (
    <Stack maw={900}>
      <Group justify="space-between">
        <Title order={2}>Scenarios</Title>
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          New scenario
        </Button>
      </Group>
      {scenarios.isPending && <Loader />}
      {scenarios.isError && <Text c="red">{scenarios.error.message}</Text>}
      {scenarios.data?.length === 0 && <Text c="dimmed">No saved scenarios yet.</Text>}
      {!!scenarios.data?.length && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Last updated</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {scenarios.data.map((s) => (
              <Table.Tr key={s.slug}>
                <Table.Td>
                  <Anchor component={Link} to={`/s/${s.slug}`}>
                    {s.name}
                  </Anchor>
                </Table.Td>
                <Table.Td>{new Date(s.updated_at).toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
