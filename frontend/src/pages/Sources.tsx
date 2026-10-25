import { Anchor, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api";

export function Sources() {
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.listSources });

  return (
    <Stack maw={1100}>
      <Title order={2}>Sources</Title>
      <Text c="dimmed">Every figure in the simulator cites one of these.</Text>
      {sources.isPending && <Loader />}
      {sources.isError && <Text c="red">{sources.error.message}</Text>}
      {sources.data?.length === 0 && <Text c="dimmed">No data has been loaded yet.</Text>}
      {!!sources.data?.length && (
        <Table>
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
      )}
    </Stack>
  );
}
