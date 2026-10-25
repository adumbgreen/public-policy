import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SimulationOptions(BaseModel):
    start_year: int = 2026
    years: int = Field(10, ge=1, le=10)
    labor_supply_responses: bool = False


class IncomeTaxPolicy(BaseModel):
    # PolicyEngine-US parameter changes in Reform.from_dict format:
    # {"gov.irs.deductions.standard.amount.SINGLE": {"2026-01-01.2100-12-31": 100000}}
    parameter_changes: dict[str, dict[str, float | bool]] = Field(default_factory=dict)


class VatPolicy(BaseModel):
    enabled: bool = False
    rate: float = Field(0.0, ge=0, le=1)
    excluded_categories: list[str] = Field(default_factory=list)


class SpendingChange(BaseModel):
    line_code: str
    mode: Literal["percent", "amount"]
    # Percent change (-25 means a 25% cut) or a change in dollars per year.
    value: float


class NewProgram(BaseModel):
    name: str
    annual_cost_usd: float = Field(ge=0)
    start_year: int | None = None
    agency_code: str | None = None


class HealthInsurancePolicy(BaseModel):
    mode: Literal["none", "published_estimate"] = "none"
    estimate_id: str | None = None


class ScenarioDefinition(BaseModel):
    schema_version: Literal[1] = 1
    options: SimulationOptions = Field(default_factory=SimulationOptions)
    income_tax: IncomeTaxPolicy = Field(default_factory=IncomeTaxPolicy)
    vat: VatPolicy = Field(default_factory=VatPolicy)
    spending_changes: list[SpendingChange] = Field(default_factory=list)
    new_programs: list[NewProgram] = Field(default_factory=list)
    health_insurance: HealthInsurancePolicy = Field(default_factory=HealthInsurancePolicy)


class ScenarioIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    definition: ScenarioDefinition = Field(default_factory=ScenarioDefinition)


class ScenarioOut(ScenarioIn):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    created_at: datetime
    updated_at: datetime


class ScenarioSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    updated_at: datetime


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: Literal["queued", "running", "succeeded", "failed"]
    engine_version: str
    result: dict | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    publisher: str
    title: str
    url: str
    table_or_page: str | None
    published_on: date | None
    retrieved_on: date
    notes: str | None
