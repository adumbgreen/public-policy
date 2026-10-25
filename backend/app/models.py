import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Source(Base):
    """A citation for public data. Every seeded figure points at one of these."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    publisher: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    table_or_page: Mapped[str | None] = mapped_column(Text)
    published_on: Mapped[date | None]
    retrieved_on: Mapped[date]
    notes: Mapped[str | None] = mapped_column(Text)


class BudgetLine(Base):
    """A revenue or outlay line. Outlays nest agency > bureau > budget account."""

    __tablename__ = "budget_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(20))  # "revenue" or "outlay"
    level: Mapped[str] = mapped_column(String(20))  # "source", "agency", "bureau", "account"
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("budget_lines.id"))

    values: Mapped[list["BudgetValue"]] = relationship(back_populates="line")


class BudgetValue(Base):
    __tablename__ = "budget_values"
    __table_args__ = (UniqueConstraint("line_id", "fiscal_year", "basis"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("budget_lines.id"))
    fiscal_year: Mapped[int]
    basis: Mapped[str] = mapped_column(String(20))  # "actual" or "projected"
    amount_usd: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"))

    line: Mapped[BudgetLine] = relationship(back_populates="values")
    source: Mapped[Source] = relationship()


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    definition: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scenario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenarios.id"))
    definition: Mapped[dict] = mapped_column(JSONB)
    definition_hash: Mapped[str] = mapped_column(String(64), index=True)
    engine_version: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    result: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]
