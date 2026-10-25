import {
  IconBook2,
  IconBuildingBank,
  IconPencilPlus,
  IconReceiptTax,
  IconShoppingCart,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import type { Policy } from "./api";
import { formatSignedUsd, formatUsd } from "./format";

type Meta = {
  label: string;
  blurb: string;
  color: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
};

export const POLICY_META: Record<Policy["type"], Meta> = {
  custom: {
    label: "Custom policy",
    blurb: "Name it and set its yearly cost or revenue yourself.",
    color: "grape",
    icon: IconPencilPlus,
  },
  income_tax: {
    label: "Income tax change",
    blurb: "Change deductions and rates. Scored with PolicyEngine's household model.",
    color: "blue",
    icon: IconReceiptTax,
  },
  vat: {
    label: "Value-added tax",
    blurb: "A national tax on consumption, with categories you exclude.",
    color: "teal",
    icon: IconShoppingCart,
  },
  spending_change: {
    label: "Agency spending change",
    blurb: "Raise or cut an agency's budget by a percent or an amount.",
    color: "orange",
    icon: IconBuildingBank,
  },
  published_estimate: {
    label: "Published estimate",
    blurb: "Use a cited cost estimate from CBO or another published source.",
    color: "gray",
    icon: IconBook2,
  },
};

const STANDARD_DEDUCTION = "gov.irs.deductions.standard.amount.";

// One plain-English line describing what a policy does.
export function summarize(policy: Policy): string {
  switch (policy.type) {
    case "custom": {
      if (!policy.annual_change_usd) return "No amount set yet";
      const parts = [`${formatSignedUsd(policy.annual_change_usd)}/yr ${policy.category}`];
      if (policy.start_year) parts.push(`from ${policy.start_year}`);
      if (policy.index_to_inflation) parts.push("grows with inflation");
      return parts.join(" · ");
    }
    case "income_tax": {
      const entries = Object.entries(policy.parameter_values);
      if (entries.length === 0) return "No changes yet";
      const single = policy.parameter_values[`${STANDARD_DEDUCTION}SINGLE`];
      const joint = policy.parameter_values[`${STANDARD_DEDUCTION}JOINT`];
      const parts: string[] = [];
      if (typeof single === "number") parts.push(`${formatUsd(single)} single`);
      if (typeof joint === "number") parts.push(`${formatUsd(joint)} joint`);
      const head = parts.length ? `Standard deduction ${parts.join(", ")}` : `${entries.length} changes`;
      return policy.index_to_inflation ? `${head} · indexed` : head;
    }
    case "vat": {
      const rate = `${+(policy.rate * 100).toFixed(2)}% on consumption`;
      return policy.excluded_categories.length
        ? `${rate} · excludes ${policy.excluded_categories.join(", ")}`
        : rate;
    }
    case "spending_change":
      return policy.mode === "percent"
        ? `${policy.value > 0 ? "+" : ""}${policy.value}% to ${policy.line_code}`
        : `${formatSignedUsd(policy.value)}/yr to ${policy.line_code}`;
    case "published_estimate":
      return policy.estimate_id;
  }
}
