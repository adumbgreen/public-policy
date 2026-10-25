import { Anchor, Card, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api";

export function Sources() {
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.listSources });

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Where the data comes from</Title>
        <Text c="dimmed" fz="lg" mt={4}>
          Every figure in the simulator cites one of these sources.
        </Text>
      </div>
      {sources.isPending && <Loader />}
      {sources.isError && <Text c="red">{sources.error.message}</Text>}
      {sources.data?.length === 0 && (
        <Card className="app-card" padding="xl">
          <Text c="dimmed" ta="center">
            No data has been loaded yet.
          </Text>
        </Card>
      )}
      {!!sources.data?.length && (
        <Card className="app-card" padding={0}>
        <Table verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Publisher</Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Table or page</Table.Th>
              <Table.Th>Published</Table.Th>
              <Table.Th>Retrieved</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sources.data.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.publisher}</Table.Td>
                <Table.Td>
                  <Anchor href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </Anchor>
                </Table.Td>
                <Table.Td>{s.table_or_page}</Table.Td>
                <Table.Td>{s.published_on}</Table.Td>
                <Table.Td>{s.retrieved_on}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        </Card>
      )}
    </Stack>
  );
}
