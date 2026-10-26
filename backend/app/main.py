from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import budget, presets, scenarios, sources

app = FastAPI(title="Federal policy simulator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(budget.router)
app.include_router(presets.router)
app.include_router(scenarios.router)
app.include_router(sources.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
