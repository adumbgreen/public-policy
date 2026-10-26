"""Ready-made policies a user can add to a scenario and then edit.

Presets that need data that isn't loaded yet (published estimates, the VAT model) come later.
"""

from pydantic import TypeAdapter

from app.schemas import Policy

_STANDARD_DEDUCTION = "gov.irs.deductions.standard.amount"

PRESETS: list[dict] = [
    {
        "type": "income_tax",
        "name": "$100,000 standard deduction",
        "description": (
            "Raises the standard deduction to $100,000 for single filers and keeps current law's "
            "ratios between filing statuses. Indexed to inflation."
        ),
        "parameter_values": {
            f"{_STANDARD_DEDUCTION}.SINGLE": 100_000,
            f"{_STANDARD_DEDUCTION}.SEPARATE": 100_000,
            f"{_STANDARD_DEDUCTION}.HEAD_OF_HOUSEHOLD": 150_000,
            f"{_STANDARD_DEDUCTION}.JOINT": 200_000,
            f"{_STANDARD_DEDUCTION}.SURVIVING_SPOUSE": 200_000,
        },
        "index_to_inflation": True,
    },
    {
        "type": "vat",
        "name": "3% value-added tax",
        "description": "A 3% national VAT on consumption, excluding healthcare and housing.",
        "rate": 0.03,
        "excluded_categories": ["healthcare", "housing"],
    },
]

PRESETS.append(
    {
        "type": "spending_change",
        "name": "Cut defense spending 25%",
        "description": (
            "Cuts outlays for the Department of Defense (military programs) by 25% from CBO's "
            "baseline in every year."
        ),
        "line_code": "agency:department-of-defense-military-programs",
        "line_name": "Department of Defense--Military Programs",
        "mode": "percent",
        "value": -25,
    }
)

# Fail at import if a preset doesn't match the policy schema.
_adapter = TypeAdapter(list[Policy])
_adapter.validate_python(PRESETS)
