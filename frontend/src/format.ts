const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

// $3T, $450B, $100K
export function formatUsd(value: number) {
  return compactUsd.format(value);
}

export function formatSignedUsd(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatUsd(Math.abs(value))}`;
}

export function timeAgo(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
}
