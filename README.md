# Federal policy simulator

A web app for building federal tax and spending scenarios and seeing their effect on the deficit, on households by income group, and on example households. Every figure cites a public, official source where one exists.

## Status

This is the app scaffold. You can create, edit and share scenarios, and queue a simulation run. Scenarios save automatically.

A scenario is a list of policies. You add each one from scratch or from a preset, then name and edit it. Policy types:

- **Custom:** you enter the yearly change to spending or revenue, and optionally a source link.
- **Income tax change:** changes to PolicyEngine parameters. The editor covers the standard deduction so far.
- **Value-added tax:** a rate and excluded spending categories.
- **Agency spending change** and **published estimate:** defined, but unavailable until the budget data is loaded.

Presets are in `backend/app/presets.py`. The simulation engine isn't built yet, so every run fails with a message saying so. The engine needs two things this repo doesn't have yet:

- PolicyEngine's household dataset, which is downloaded from Hugging Face
- The budget baseline (CBO, OMB, Treasury) and VAT and health data (BLS, BEA, CMS)

## Stack

| Part | Tools |
|---|---|
| Frontend | React, TypeScript, Vite, Mantine, TanStack Query, React Router, Inter font |
| API | Python, FastAPI, SQLAlchemy, Alembic, uv |
| Worker | Same Python package. Pulls queued runs from Postgres. |
| Database | Postgres 16 |
| Tax model | [PolicyEngine-US](https://github.com/PolicyEngine/policyengine-us) (AGPL-3.0), not yet added |

Simulations run in a separate worker process because a microsimulation can take longer than a web request should. Runs are cached: two scenarios with the same policy definition share one run.

## Run it with Docker

```sh
docker compose up --build
```

Then open http://localhost:8080. The API container applies database migrations on startup.

## Run it for development

You need Postgres 16, [uv](https://docs.astral.sh/uv/), and Node 22.

1. Create a database. The default connection string is `postgresql+psycopg://policy:policy@localhost:5432/policy`. To use a different one, set `DATABASE_URL`.
2. Start the API:

   ```sh
   cd backend
   uv sync
   uv run alembic upgrade head
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

The backend tests need a Postgres database named `policy_test`, or set `DATABASE_URL` to another database. The tests drop and recreate every table in it.

```sh
cd backend
uv run pytest
uv run ruff check . && uv run ruff format --check .

cd ../frontend
npm run build
```

## Modeling decisions

- **Income and payroll tax:** PolicyEngine-US microsimulation. A scenario stores tax changes as PolicyEngine parameter changes, so any PolicyEngine parameter can be changed.
- **Behavioral responses:** optional labor-supply responses, using PolicyEngine's elasticities. There's no GDP or interest-rate feedback.
- **Baseline:** policy changes are calculated with PolicyEngine and applied to CBO's baseline totals. PolicyEngine's own baseline revenue doesn't exactly match CBO's.
- **VAT:** not modeled by PolicyEngine. Household spending will be estimated from the BLS Consumer Expenditure Survey and scaled to BEA personal consumption totals.
- **Spending:** agency-level outlays. The `budget_lines` table nests agency, bureau and program, so program-level detail can be added later.
- **Published estimates:** policies such as national health insurance can use a cited cost estimate, or be entered as a custom policy.
- **Inflation indexing:** income tax values use PolicyEngine's uprating for each parameter. Custom policies use CBO's inflation projection.
- **Sources:** every seeded figure points to a row in the `sources` table, with publisher, title, URL, table or page, and retrieval date.

## Layout

```
backend/
  app/
    main.py        FastAPI app
    presets.py     Ready-made policies
    models.py      Database tables
    schemas.py     API and scenario definition schemas
    engine.py      Scores a scenario (not built yet)
    runs.py        Queues runs and reuses cached ones
    worker.py      Runs queued simulations
    routers/       API routes
  alembic/         Database migrations
  tests/
frontend/
  src/
    api.ts         API client and types
    components/    Policy card, policy picker, impact panel
    theme.ts       Mantine theme (colors, font, radius)
    brand.ts       App name
    pages/         Home, scenario workspace, sources
docker-compose.yml
```
