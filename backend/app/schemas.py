import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SimulationOptions(BaseModel):
    start_year: int = 2026
    years: int = Field(10, ge=1, le=10)
    labor_supply_responses: bool = False


class PolicyBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class CustomPolicy(PolicyBase):
    """A policy whose budget effect the user enters directly."""

    type: Literal["custom"] = "custom"
    category: Literal["spending", "revenue"]
    # Change per year in the first year. Positive means more spending or more revenue.
    annual_change_usd: float
    start_year: int | None = None
    index_to_inflation: bool = False
    source_url: str | None = None


class IncomeTaxPolicy(PolicyBase):
    """Changes to PolicyEngine-US parameters, in effect from the scenario's first year."""

    type: Literal["income_tax"] = "income_tax"
    # {"gov.irs.deductions.standard.amount.SINGLE": 100000}
    parameter_values: dict[str, float | bool] = Field(default_factory=dict)
    # Grow the values each year with PolicyEngine's uprating for each parameter.
    index_to_inflation: bool = True


class VatPolicy(PolicyBase):
    type: Literal["vat"] = "vat"
    rate: float = Field(ge=0, le=1)
    excluded_categories: list[str] = Field(default_factory=list)


class SpendingChangePolicy(PolicyBase):
    type: Literal["spending_change"] = "spending_change"
    line_code: str
    mode: Literal["percent", "amount"]
    # Percent change (-25 means a 25% cut) or a change in dollars per year.
    value: float


class PublishedEstimatePolicy(PolicyBase):
    type: Literal["published_estimate"] = "published_estimate"
    estimate_id: str


Policy = Annotated[
    CustomPolicy | IncomeTaxPolicy | VatPolicy | SpendingChangePolicy | PublishedEstimatePolicy,
    Field(discriminator="type"),
]


class ScenarioDefinition(BaseModel):
    schema_version: Literal[1] = 1
    options: SimulationOptions = Field(default_factory=SimulationOptions)
    policies: list[Policy] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_conflicts(self):
        if sum(isinstance(p, VatPolicy) for p in self.policies) > 1:
            raise ValueError("A scenario can have only one VAT policy.")
        seen: dict[str, str] = {}
        for policy in self.policies:
            if isinstance(policy, IncomeTaxPolicy):
                for path in policy.parameter_values:
                    if path in seen:
                        raise ValueError(f"'{policy.name}' and '{seen[path]}' both change {path}.")
                    seen[path] = policy.name
        return self


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
