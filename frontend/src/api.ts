// Types mirror backend/app/schemas.py.

export type SimulationOptions = {
  start_year: number;
  years: number;
  labor_supply_responses: boolean;
};

export type SpendingChange = {
  line_code: string;
  mode: "percent" | "amount";
  value: number;
};

export type NewProgram = {
  name: string;
  annual_cost_usd: number;
  start_year: number | null;
  agency_code: string | null;
};

export type ScenarioDefinition = {
  schema_version: 1;
  options: SimulationOptions;
  income_tax: { parameter_changes: Record<string, Record<string, number | boolean>> };
  vat: { enabled: boolean; rate: number; excluded_categories: string[] };
  spending_changes: SpendingChange[];
  new_programs: NewProgram[];
  health_insurance: { mode: "none" | "published_estimate"; estimate_id: string | null };
};

export type Scenario = {
  slug: string;
  name: string;
  description: string;
  definition: ScenarioDefinition;
  created_at: string;
  updated_at: string;
};

export type ScenarioSummary = Pick<Scenario, "slug" | "name" | "updated_at">;

export type Run = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  engine_version: string;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type Source = {
  id: number;
  publisher: string;
  title: string;
  url: string;
  table_or_page: string | null;
  published_on: string | null;
  retrieved_on: string;
  notes: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listScenarios: () => request<ScenarioSummary[]>("/api/scenarios"),
  getScenario: (slug: string) => request<Scenario>(`/api/scenarios/${slug}`),
  createScenario: (name: string) =>
    request<Scenario>("/api/scenarios", { method: "POST", body: JSON.stringify({ name }) }),
  updateScenario: (slug: string, body: Pick<Scenario, "name" | "description" | "definition">) =>
    request<Scenario>(`/api/scenarios/${slug}`, { method: "PUT", body: JSON.stringify(body) }),
  startRun: (slug: string) => request<Run>(`/api/scenarios/${slug}/runs`, { method: "POST" }),
  getRun: (id: string) => request<Run>(`/api/runs/${id}`),
  listSources: () => request<Source[]>("/api/sources"),
};
