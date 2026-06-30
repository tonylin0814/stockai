# Codex Prompt 23 — Stock Detail Page: Hide N/A Fields + Always Show Committee Output

**Goal**: Fix two UX problems on the stock detail page:
1. 建議買進區間 / 目標價 / 停損點 always show "不適用" for watch/wait recommendations — should be hidden entirely
2. Only the OpenAI division output shows because committee recommendations are only saved when `isActionAllowed = true` — should always save committee output

**Apply after**: Prompts 01–22 applied.

---

## Fix A: Always save committee recommendation (regardless of `isActionAllowed`)

### File: `src/lib/analysis/pipeline/recommendations.ts`

Find the block around line 234:

```typescript
if (params.committeeDecision?.decision.isActionAllowed) {
  for (const recommendation of params.committeeDecision.decision.finalRecommendations) {
```

Replace with — remove the `isActionAllowed` guard so the committee result always saves:

```typescript
if (params.committeeDecision) {
  // Always save committee output, even when isActionAllowed = false (e.g. watch/wait).
  // This ensures the detail page always shows the synthesised committee view, not a raw division output.
  if (
    params.committeeDecision.decision.isActionAllowed &&
    params.committeeDecision.decision.finalRecommendations?.length
  ) {
    // Committee approved action — save per-symbol recommendations
    for (const recommendation of params.committeeDecision.decision.finalRecommendations) {
```

Then close the inner `if` block and add an `else` that saves a single committee summary row:

```typescript
    } // end for
  } else {
    // Committee said wait/no_action — save a single summary row so the detail page can display it
    await saveRecommendation({
      userId: params.userId,
      familyId: params.familyId,
      dailyRunId: params.dailyRunId ?? null,
      missionId: params.missionId ?? null,
      securityId: null, // no specific symbol targeted
      symbol: null,
      market: null,
      action: params.committeeDecision.decision.finalAction ?? "wait",
      reason: params.committeeDecision.decision.reason,
      confidence: params.committeeDecision.decision.confidence,
      buyZoneLow: null,
      buyZoneHigh: null,
      targetPrice: null,
      stopLoss: null,
      keyRisks: params.committeeDecision.decision.mostConservativeDivision
        ? [`保守方：${params.committeeDecision.decision.mostConservativeDivision}`]
        : [],
      timeHorizon: null,
      sourceType: "committee",
      sourceId: params.committeeDecisionId,
      sourceName: "投資委員會",
      division: null,
      fallbackAction: params.committeeDecision.decision.finalAction ?? "wait"
    });
  }
}
```

**Important**: Check the exact function signature of `saveRecommendation` in the file — pass only the parameters it accepts. If `securityId` and `symbol` are required, use the first symbol from `params.committeeDecision.decision.finalRecommendations` (if any), or skip saving if there are no recommendations and just log a note.

---

## Fix B: Update `source_name` display label

### File: `src/app/portfolio/[id]/page.tsx`

Find line ~255:
```tsx
來源：{latestRec.source_name}（{latestRec.source_type}）
```

Replace with a user-friendly label:
```tsx
{latestRec.source_type === "committee"
  ? "來源：投資委員會"
  : latestRec.source_type === "division"
    ? "來源：AI 快速分析"
    : "來源：AI 分析團隊"}
```

---

## Fix C: Hide 建議買進區間 / 目標價 / 停損點 when not applicable

### File: `src/app/portfolio/[id]/page.tsx`

The three fields (建議買進區間, 目標價, 停損點) should only render when there is at least one non-null value among them. Find the grid that renders these three fields and wrap the entire block:

```tsx
{/* Only show price targets when action is a buy/hold variant with targets */}
{(latestRec.buy_zone_low !== null ||
  latestRec.target_price !== null ||
  latestRec.stop_loss !== null) && (
  <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
    {/* 建議買進區間 */}
    <div>
      <div className="text-slate-500 text-xs">建議買進區間</div>
      <div className="font-medium">
        {latestRec.buy_zone_low !== null && latestRec.buy_zone_high !== null
          ? `${formatNumber(latestRec.buy_zone_low, 2)} - ${formatNumber(latestRec.buy_zone_high, 2)}`
          : "—"}
      </div>
    </div>
    {/* 目標價 */}
    <div>
      <div className="text-slate-500 text-xs">目標價</div>
      <div className="font-medium">
        {latestRec.target_price !== null ? formatNumber(latestRec.target_price, 2) : "—"}
      </div>
    </div>
    {/* 停損點 */}
    <div>
      <div className="text-slate-500 text-xs">停損點</div>
      <div className={`font-medium ${latestRec.stop_loss !== null ? "text-red-600" : "text-slate-400"}`}>
        {latestRec.stop_loss !== null ? formatNumber(latestRec.stop_loss, 2) : "—"}
      </div>
    </div>
  </div>
)}
```

When all three are null (watch/wait recommendations), the entire block disappears. When at least one is present, it shows with "—" for the missing ones (grey, not red).

---

## Fix D: Also prefer committee recommendation when querying

### File: `src/app/portfolio/[id]/page.tsx`

The current query fetches recommendations and takes `[0]`. Since committee rows are now always saved, ensure committee rows sort first by updating the query to prefer `source_type = 'committee'`:

```typescript
const recommendationsQuery = supabase
  .from("recommendations")
  .select(
    "id, action, reason, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, key_risks, time_horizon, source_type, source_name, recommendation_date, created_at, user_rating"
  )
  .eq("user_id", user.id)
  .eq("security_id", security.id)
  .order("source_type", { ascending: false }) // "committee" > "division" > "team" alphabetically... not reliable
  .order("created_at", { ascending: false })
  .limit(10);
```

Then after fetching, pick the committee row if available, otherwise fall back to latest:

```typescript
const recommendations = recommendationsResult.data ?? [];
const latestRec =
  recommendations.find((r) => r.source_type === "committee") ??
  recommendations[0] ??
  null;
```

This ensures that once a committee decision exists for this stock, it always takes priority over raw division output.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/pipeline/recommendations.ts` | Always save committee row, not just when `isActionAllowed = true` |
| `src/app/portfolio/[id]/page.tsx` | Prefer committee rec in query; hide price targets when all null; friendlier source label |

## Expected result

- 觀望 recommendation: shows clean AI 分析建議 card with 信心度, reason text, key risks — no 不適用 clutter
- 來源 label shows "投資委員會" or "AI 快速分析" — not "OpenAI 快速分析（division）"
- When a buy signal exists: 建議買進區間 / 目標價 / 停損點 show with real numbers
