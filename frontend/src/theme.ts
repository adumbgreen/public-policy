import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  defaultGradient: { from: "indigo", to: "violet", deg: 135 },
  defaultRadius: "md",
  fontFamily: "'Inter Variable', system-ui, sans-serif",
  headings: {
    fontFamily: "'Inter Variable', system-ui, sans-serif",
    fontWeight: "750",
  },
  components: {
    Card: { defaultProps: { radius: "lg" } },
    Button: { defaultProps: { radius: "xl" } },
  },
});
