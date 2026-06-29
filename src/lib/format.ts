export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatCurrency(value: number, currency: string) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatSignedNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

export function formatSignedPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
