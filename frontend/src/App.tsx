import {
  ActionIcon,
  AppShell,
  Box,
  Container,
  Group,
  Text,
  ThemeIcon,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconBuildingBank, IconMoon, IconSun } from "@tabler/icons-react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import { APP_NAME } from "./brand";
import { Home } from "./pages/Home";
import { ScenarioEditor } from "./pages/ScenarioEditor";
import { Sources } from "./pages/Sources";

function NavItem({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <UnstyledButton
      component={Link}
      to={to}
      px="md"
      py={6}
      style={{ borderRadius: 999 }}
      bg={active ? "var(--mantine-color-indigo-light)" : undefined}
      c={active ? "indigo" : "dimmed"}
      fw={600}
      fz="sm"
    >
      {label}
    </UnstyledButton>
  );
}

export function App() {
  const { pathname } = useLocation();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");

  return (
    <AppShell header={{ height: 64 }} padding={0}>
      <AppShell.Header
        style={{ backdropFilter: "blur(12px)", background: "color-mix(in srgb, var(--mantine-color-body) 82%, transparent)" }}
      >
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="lg">
              <UnstyledButton component={Link} to="/">
                <Group gap={10}>
                  <ThemeIcon variant="gradient" size={34} radius="md">
                    <IconBuildingBank size={20} />
                  </ThemeIcon>
                  <Text fw={800} fz="lg" style={{ letterSpacing: "-0.03em" }} visibleFrom="xs">
                    {APP_NAME}
                  </Text>
                </Group>
              </UnstyledButton>
              <Group gap={4}>
                <NavItem to="/" label="Scenarios" active={pathname === "/" || pathname.startsWith("/s/")} />
                <NavItem to="/sources" label="Sources" active={pathname === "/sources"} />
              </Group>
            </Group>
            <ActionIcon
              variant="default"
              size="lg"
              radius="xl"
              aria-label="Toggle color scheme"
              onClick={() => setColorScheme(scheme === "light" ? "dark" : "light")}
            >
              {scheme === "light" ? <IconMoon size={18} /> : <IconSun size={18} />}
            </ActionIcon>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl" py="xl">
          <Box>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/s/:slug" element={<ScenarioEditor />} />
              <Route path="/sources" element={<Sources />} />
            </Routes>
          </Box>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
