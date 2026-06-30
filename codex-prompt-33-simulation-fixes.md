# Codex Prompt 33 — Simulation UI Fixes

Two small changes to the simulation trading system.

---

## Fix 1 — Add Reset button to simulation action buttons

**File:** `src/components/simulation-action-buttons.tsx`

Add a "重置交易" (Reset) action alongside the existing three buttons.

Current `ActionKey` type:
```typescript
type ActionKey = "trade" | "report" | "weekly";
```

New `ActionKey` type:
```typescript
type ActionKey = "trade" | "report" | "weekly" | "reset";
```

Current import:
```typescript
import { BarChart3, FileText, Play } from "lucide-react";
```

New import:
```typescript
import { BarChart3, FileText, Play, RotateCcw } from "lucide-react";
```

Add the reset entry to the `actions` record (after `weekly`):
```typescript
reset: {
  label: "重置交易",
  loading: "重置中...",
  path: "/api/simulation/reset",
  icon: RotateCcw
}
```

The reset button should render with `variant="secondary"` (same as report and weekly). It calls `POST /api/simulation/reset` which wipes all trades and positions and resets cash to starting balances.

---

## Fix 2 — Normalize AI market field in TradeDecisionSchema

**File:** `src/lib/simulation/run-trade.ts`

The AI sometimes returns non-standard market values like `"NYSE"`, `"TWSE"`, `"Taiwan"` which fail Zod validation. Replace the strict enum with a preprocessor.

Find:
```typescript
market: z.enum(["US", "TW"]),
```

Replace with:
```typescript
market: z.preprocess(
  (v) => {
    if (typeof v !== "string") return "US";
    const u = v.toUpperCase().trim();
    if (u === "TW" || u.includes("TW") || u.includes("台") || u.includes("TAIEX") || u.includes("TWSE")) return "TW";
    return "US";
  },
  z.enum(["US", "TW"])
),
```

---

## Fix 3 — Use market universe for candidate selection (not user's watchlist)

**File:** `src/lib/simulation/run-trade.ts`

The AI divisions should pick stocks independently from the full market universe, not from the user's personal watchlist or portfolio. If `loadCandidates` currently reads from `portfolio_holdings` or `watchlist_items`, replace it entirely with:

```typescript
import { TW_SCAN_UNIVERSE } from "@/lib/analysis/tw-universe";
import { US_UNIVERSE_UNDER_50, US_UNIVERSE_50_TO_100, US_UNIVERSE_100_TO_200 } from "@/lib/analysis/us-universe";

function loadCandidates(market: Market) {
  const universe = market === "US"
    ? [...US_UNIVERSE_UNDER_50, ...US_UNIVERSE_50_TO_100, ...US_UNIVERSE_100_TO_200]
    : TW_SCAN_UNIVERSE;
  // Shuffle so each session sees variety across runs
  const shuffled = [...universe].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 8);
}
```

Update the call site — `loadCandidates` no longer needs `supabase` or `userId` parameters:
```typescript
// Before:
const candidates = await loadCandidates(supabase, userId, market);
// After:
const candidates = loadCandidates(market);
```

---

## TypeScript check

```bash
npx tsc --noEmit
```

Must pass with no errors before finishing.
