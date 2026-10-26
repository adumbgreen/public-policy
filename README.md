# Federal policy simulator

A web app for building federal tax and spending scenarios and seeing their effect on the deficit and on households by income group. Every figure cites a public, official source where one exists.

## Status

You can build, share and score scenarios. A scenario is a list of policies. You add each one from scratch or from a preset, then name and edit it. Scenarios save automatically.

| Policy type | How it's scored | Speed |
|---|---|---|
| Custom | The yearly change to spending or revenue you enter, optionally grown with CBO's CPI-U projection | Instant |
| Agency spending change | A percent or dollar change to an agency's outlays in CBO's baseline | Instant |
| Income tax change | PolicyEngine-US microsimulation of US households | Minutes per year |
| Value-added tax | Not modeled yet. Needs BLS consumer spending data. | |
| Published estimate | Not loaded yet | |

The impact panel updates as you edit. Income tax changes show as pending until you run the simulation. Finished runs are saved, so a scenario with the same policies is never scored twice.

Not built yet: behavioral responses (need a cited set of labor-supply elasticities), the VAT model, published estimates, and the household calculator.

Presets are in `backend/app/presets.py`.

## Stack

| Part | Tools |
|---|---|
| Frontend | React, TypeScript, Vite, Mantine, Mantine Charts, TanStack Query, React Router, Inter font |
| API | Python, FastAPI, SQLAlchemy, Alembic, uv |
| Worker | Same Python package. Pulls queued runs from Postgres. |
| Database | Postgres 16 |
| Tax model | [PolicyEngine-US](https://github.com/PolicyEngine/policyengine-us) 2.63.3 (AGPL-3.0) |

## Simulation engine

The worker scores income tax changes with PolicyEngine-US on its household dataset (57,240 households, weighted to the US population). The dataset downloads from Hugging Face on the first run, about 830 MB.

To make runs fast enough to use:

- **Shards.** Households are split across several processes that run in parallel. Each household's tax is calculated independently, so the shards' results add up exactly to a single full run.
- **Warm processes.** Each shard process imports PolicyEngine and loads its households once, then keeps them for later runs. It also keeps the baseline results for each year it has calculated.
- **One reform build per run.** The reformed tax system takes about 20 seconds to build, so it's built once and reused for every year.
- **One year at a time.** Each year runs in a short-lived forked copy of the shard process, which exits afterward. PolicyEngine otherwise keeps several hundred MB per year after a simulation finishes.

Measured on a 4-core, 15 GB container with 2 shards: about 4 minutes for a year's baseline and 3 more minutes for the reform. More shards on more cores finish sooner. Set the number with `ENGINE_SHARDS`. Each shard needs about 2 GB plus its share of about 8 GB of working memory.

## Run it with Docker

```sh
docker compose up --build
```

Then open http://localhost:8080. The API container applies database migrations and loads the seed data on startup. The worker keeps the household dataset in a volume.

## Run it for development

You need Postgres 16, [uv](https://docs.astral.sh/uv/), and Node 22.

1. Create a database. The default connection string is `postgresql+psycopg://policy:policy@localhost:5432/policy`. To use a different one, set `DATABASE_URL`.
2. Start the API:

   ```sh
   cd backend
   uv sync
   uv run alembic upgrade head
   uv run python -m app.seed
   uv run uvicorn app.main:app --reload
   ```

3. In a second terminal, start the worker:

   ```sh
   cd backend
   uv run python -m app.worker
   ```

4. In a third terminal, start the frontend. Vite sends `/api` requests to port 8000.

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

5. Open http://localhost:5173.

## Tests and checks

The backend tests need a Postgres database named `policy_test`, or set `DATABASE_URL` to another database. The tests drop and recreate every table in it. They don't run PolicyEngine; the engine tests use a stand-in for it.

```sh
cd backend
uv run pytest
uv run ruff check . && uv run ruff format --check .

cd ../frontend
npm run build
```

## Data

Seed data lives in `backend/data/seed/`, with one entry per file in `sources.json`. `python -m app.seed` replaces the `sources`, `budget_lines`, `budget_values` and `economic_values` tables with it. Scenarios aren't touched.

| Data | Source | Coverage |
|---|---|---|
| Revenue by source | CBO 10-Year Budget Projections, February 2026 | FY2025 actual, FY2026 to FY2036 projected |
| Outlays by agency, bureau and budget account | CBO Spending Projections, by Budget Account, February 2026 | FY2026 to FY2036 |
| Average interest rate on debt held by the public | CBO 10-Year Budget Projections, February 2026 | FY2025 to FY2036 |
| CPI-U | CBO 10-Year Economic Projections, February 2026 | FY2023 to FY2036 |

The CBO files come from CBO's open-data repository on GitHub ([US-CBO/cbo-data](https://github.com/US-CBO/cbo-data)), because cbo.gov blocks automated downloads. A test checks that agency, bureau and account outlays, and revenue by source, add up to CBO's published totals.

## Modeling decisions

- **Baseline.** CBO's February 2026 projections. Each policy's change is added to CBO's totals. PolicyEngine's own baseline revenue doesn't exactly match CBO's, so only its change is used.
- **Income tax timing.** PolicyEngine calculates tax years. A tax year's change is counted in the fiscal year with the same number.
- **Indexing.** An indexed income tax value grows with the same index and rounding PolicyEngine uses for that parameter under current law (for the standard deduction, `gov.irs.uprating`, rounded down to $50). A custom policy can grow with CBO's CPI-U projection.
- **Several income tax policies** are scored together in one run, because they interact. The combined effect is reported on the first one.
- **Net interest.** CBO's average interest rate on debt held by the public, applied each year to the change in debt at the start of the year plus half of that year's change in borrowing. CBO's own debt-service estimates use more detail.
- **Income groups.** Households are ranked by market income and split into tenths, weighted by household weight. The chart shows the average change in federal income tax per household.
- **Behavioral responses.** Not applied yet. PolicyEngine supports labor-supply responses, but all of its elasticities default to zero, so they need a cited set of values.
- **VAT.** Not modeled by PolicyEngine. The plan is to estimate household spending from the BLS Consumer Expenditure Survey and scale it to BEA personal consumption totals.
- **Sources.** Every seeded figure points to a row in the `sources` table, with publisher, title, URL, table or page, and retrieval date.

## Layout

```
backend/
  app/
    main.py        FastAPI app
    budget.py      Instant estimates against CBO's baseline, net interest, yearly totals
    engine.py      Scores a scenario: microsimulation plus budget.py
    microsim.py    PolicyEngine shards, indexing, income deciles
    presets.py     Ready-made policies
    models.py      Database tables
    seed.py        Loads backend/data/seed into the database
    schemas.py     API and scenario definition schemas
    runs.py        Queues runs and reuses saved ones
    worker.py      Runs queued simulations
    routers/       API routes
  alembic/         Database migrations
  data/seed/       CBO files and their sources
  tests/
frontend/
  src/
    api.ts         API client and types
    components/    Policy card, policy picker, impact panel, results charts
    theme.ts       Mantine theme (colors, font, radius)
    brand.ts       App name
    pages/         Home, scenario workspace, sources
docker-compose.yml
```
