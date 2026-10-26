// Types mirror backend/app/schemas.py.

export type SimulationOptions = {
  start_year: number;
  years: number;
  labor_supply_responses: boolean;
};

type PolicyBase = { name: string; description: string };

export type CustomPolicy = PolicyBase & {
  type: "custom";
  category: "spending" | "revenue";
  annual_change_usd: number;
  start_year: number | null;
  index_to_inflation: boolean;
  source_url: string | null;
};

export type IncomeTaxPolicy = PolicyBase & {
  type: "income_tax";
  parameter_values: Record<string, number | boolean>;
  index_to_inflation: boolean;
};

export type VatPolicy = PolicyBase & {
  type: "vat";
  rate: number;
  excluded_categories: string[];
};

export type SpendingChangePolicy = PolicyBase & {
  type: "spending_change";
  line_code: string;
  line_name: string;
  mode: "percent" | "amount";
  value: number;
};

export type PublishedEstimatePolicy = PolicyBase & {
  type: "published_estimate";
  estimate_id: string;
};

export type Policy =
  | CustomPolicy
  | IncomeTaxPolicy
  | VatPolicy
  | SpendingChangePolicy
  | PublishedEstimatePolicy;

export type ScenarioDefinition = {
  schema_version: 1;
  options: SimulationOptions;
  policies: Policy[];
};

export type Scenario = {
  slug: string;
  name: string;
  description: string;
  definition: ScenarioDefinition;
  created_at: string;
  updated_at: string;
};

export type ScenarioSummary = Pick<Scenario, "slug" | "name" | "description" | "updated_at"> & {
  policy_names: string[];
};

export type Run = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  engine_version: string;
  progress: string | null;
  result: EstimateResult | null;
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

// JSON object keys are strings, so yearly values are keyed by the year as a string.
export type ByYear = Record<string, number>;

export type PolicyResult = {
  name: string;
  type: Policy["type"];
  status: "estimated" | "modeled" | "pending" | "not_modeled";
  note: string | null;
  revenue_change: ByYear;
  outlay_change: ByYear;
};

export type DecileRow = {
  decile: number;
  households: number;
  total_tax_change: number;
  average_tax_change: number;
  share_with_tax_cut: number;
};

export type EstimateResult = {
  years: number[];
  baseline: { revenue: ByYear; outlays: ByYear; deficit: ByYear };
  policies: PolicyResult[];
  totals: {
    revenue_change: ByYear;
    outlay_change: ByYear;
    net_interest_change: ByYear;
    deficit_change: ByYear;
    deficit: ByYear;
  };
  complete: boolean;
  // Only in simulation results.
  distribution?: Record<string, DecileRow[]> | null;
  notes?: string[];
};

export type BudgetLine = {
  code: string;
  name: string;
  level: "agency" | "bureau" | "account";
  parent_code: string | null;
  outlays_usd: number | null;
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
  createScenario: (name: string, policies: Policy[] = []) =>
    request<Scenario>("/api/scenarios", {
      method: "POST",
      body: JSON.stringify({ name, definition: { policies } }),
    }),
  updateScenario: (slug: string, body: Pick<Scenario, "name" | "description" | "definition">) =>
    request<Scenario>(`/api/scenarios/${slug}`, { method: "PUT", body: JSON.stringify(body) }),
  startRun: (slug: string) => request<Run>(`/api/scenarios/${slug}/runs`, { method: "POST" }),
  getRun: (id: string) => request<Run>(`/api/runs/${id}`),
  listSources: () => request<Source[]>("/api/sources"),
  listPresets: () => request<Policy[]>("/api/presets"),
  estimate: (definition: ScenarioDefinition) =>
    request<EstimateResult>("/api/estimate", { method: "POST", body: JSON.stringify(definition) }),
  listAgencies: () => request<BudgetLine[]>("/api/budget/lines?level=agency"),
};
