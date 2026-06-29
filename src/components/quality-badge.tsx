import type { DataQualityState } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

const badgeClasses: Record<DataQualityState, string> = {
  fresh: "border-green-200 bg-green-50 text-green-700",
  delayed: "border-yellow-200 bg-yellow-50 text-yellow-800",
  stale: "border-red-200 bg-red-50 text-red-700",
  missing: "border-slate-200 bg-slate-100 text-slate-600",
  conflicting: "border-orange-200 bg-orange-50 text-orange-700"
};

export function QualityBadge({ state }: { state: DataQualityState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        badgeClasses[state]
      )}
    >
      {state}
    </span>
  );
}
