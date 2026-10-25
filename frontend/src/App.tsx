import { AppShell, Group, NavLink, Title } from "@mantine/core";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import { ScenarioEditor } from "./pages/ScenarioEditor";
import { ScenarioList } from "./pages/ScenarioList";
import { Sources } from "./pages/Sources";

export function App() {
  const { pathname } = useLocation();

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 200, breakpoint: "sm" }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md">
          <Title order={4}>Federal policy simulator</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <NavLink
          component={Link}
          to="/"
          label="Scenarios"
          active={pathname === "/" || pathname.startsWith("/s/")}
        />
        <NavLink component={Link} to="/sources" label="Sources" active={pathname === "/sources"} />
      </AppShell.Navbar>
      <AppShell.Main>
        <Routes>
          <Route path="/" element={<ScenarioList />} />
          <Route path="/s/:slug" element={<ScenarioEditor />} />
          <Route path="/sources" element={<Sources />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
