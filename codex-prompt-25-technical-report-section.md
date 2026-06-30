# Codex Prompt 25 — Technical Analysis Section in AI Report

**Goal**: The AI reads technical indicators (K線形態, 支撐/壓力, 量能, MA位置) but never explicitly reports them. Add a `technicalHighlights` field to the mission analysis output, save it to the DB, and display it as a dedicated section on the stock detail page.

**Apply after**: Prompts 01–24 applied (especially 24, which adds candlePattern/support/resistance to TechnicalSummary).

---

## Step 1: DB migration — add `technical_highlights` column

Create file `supabase/migrations/202606300006_technical_highlights.sql`:

```sql
alter table public.recommendations
  add column if not exists technical_highlights jsonb;
```

---

## Step 2: Add `technicalHighlights` to `MissionAnalysisSchema` in `src/lib/analysis/schemas.ts`

Find `MissionAnalysisSchema`:

```typescript
export const MissionAnalysisSchema = z.object({
  missionTitle: z.string(),
  missionType: z.string(),
  relatedSymbols: z.array(z.string()),
  summary: z.string(),
  suggestion: z.enum(["buy", "wait", "reject", "hold", "reduce", "sell"]),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  reason: z.string(),
  keyRisks: z.array(z.string()),
  conditionsToAct: z.array(z.string()),
  scenarios: ScenariosSchema.optional()
});
```

Add `technicalHighlights` field:

```typescript
export const MissionAnalysisSchema = z.object({
  missionTitle: z.string(),
  missionType: z.string(),
  relatedSymbols: z.array(z.string()),
  summary: z.string(),
  suggestion: z.enum(["buy", "wait", "reject", "hold", "reduce", "sell"]),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  reason: z.string(),
  technicalHighlights: z.array(z.string()).default([]),
  keyRisks: z.array(z.string()),
  conditionsToAct: z.array(z.string()),
  scenarios: ScenariosSchema.optional()
});
```

Also update the `MISSION_ANALYSIS_JSON_SCHEMA` constant (find it in schemas.ts or mission-analysis.ts) to include `technicalHighlights` in the example JSON:

```typescript
"technicalHighlights": [
  "現價高於月線(SMA20=152.3)，趨勢偏多",
  "年線支撐在 141.2，當前距年線 +9.6%",
  "出現多頭吞噬形態，看多反轉訊號",
  "強支撐位 148.5（曾三度守穩）",
  "昨日放量上漲（2.3x 均量），突破可信度高"
],
```

---

## Step 3: Update `buildMissionAnalysisPrompt` in `src/lib/analysis/prompts/mission-analysis.ts`

Find the rules/output section near the end of the prompt and add a `technicalHighlights` writing rule:

```typescript
## technicalHighlights 欄位寫作規則

technicalHighlights 是技術面專屬摘要，每條 1 句話，必須包含具體數字。必填 2–5 條，涵蓋：

1. **MA位置**：現價相對月線(SMA20)/季線(SMA60)/年線(SMA200)的位置與百分比距離
   例：「現價高於月線(SMA20=$152.3)，距月線 +4.9%，短線偏強」
   若 SMA200 有資料，必須提及：「年線支撐在 $141.2，距年線 +9.6%」

2. **K線形態**（若 candlePattern 不為 null）：形態名稱 + 含義
   例：「出現多頭吞噬形態，短線看多反轉訊號，需觀察次日確認」

3. **支撐/壓力**（若有資料）：具體價位 + 強弱 + 含義
   例：「強支撐位 $148.5（前低曾三度守穩），可作為停損參考」
   例：「壓力位 $168.0（前高），突破需放量確認」

4. **量能**（若 volumeSignal 不為 normal/null）：量能訊號 + 含義
   例：「昨日成交量為均量的 2.3 倍，放量上漲，突破訊號可信度高」

5. **RSI / MACD**（若有資料）：數值 + 判斷
   例：「RSI=62，偏強但未超買，仍有上漲空間」
   例：「MACD 出現黃金交叉（bullish_cross），動能轉強」

若某項技術資料為 null 或缺失，跳過該條，不得編造數字。
```

---

## Step 4: Save `technical_highlights` in `src/lib/analysis/pipeline/recommendations.ts`

Find the `saveRecommendation` function and its call inside `saveMissionRecommendations` (or wherever mission analysis results are saved).

In the insert payload, add:

```typescript
technical_highlights: params.technicalHighlights ?? null,
```

Also update the `SaveRecommendationParams` interface (if it exists) to include:

```typescript
technicalHighlights?: string[] | null;
```

When calling `saveRecommendation` from the mission analysis pipeline, pass:

```typescript
technicalHighlights: missionOutput.technicalHighlights ?? []
```

---

## Step 5: Fetch and display on stock detail page

### File: `src/app/portfolio/[id]/page.tsx`

#### Update recommendations query to include `technical_highlights`

```typescript
const recommendationsQuery = supabase
  .from("recommendations")
  .select(
    "id, action, reason, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, key_risks, technical_highlights, time_horizon, source_type, source_name, recommendation_date, created_at, user_rating"
  )
  // ...rest of query
```

#### Update `latestRec` type to include `technical_highlights`

```typescript
const latestRec = ... as {
  // ... existing fields ...
  technical_highlights: string[] | null;
} | null;
```

#### Add technical highlights section to the AI 分析建議 card

Insert this block **before** the `分析理由` paragraph (after the action/confidence/source header):

```tsx
{/* 技術面重點 */}
{asStringArray(latestRec.technical_highlights).length > 0 && (
  <div className="mt-4 rounded-md bg-slate-50 p-3">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      技術面分析
    </div>
    <ul className="space-y-1">
      {asStringArray(latestRec.technical_highlights).map((point, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
          <span className="mt-0.5 text-blue-400">▸</span>
          <span>{point}</span>
        </li>
      ))}
    </ul>
  </div>
)}
```

Note: `asStringArray` helper already exists in the file — reuse it.

---

## Summary of files changed

| File | Change |
|------|--------|
| `supabase/migrations/202606300006_technical_highlights.sql` | **NEW** — add `technical_highlights jsonb` column to recommendations |
| `src/lib/analysis/schemas.ts` | Add `technicalHighlights: z.array(z.string()).default([])` to `MissionAnalysisSchema`; update JSON schema example |
| `src/lib/analysis/prompts/mission-analysis.ts` | Add `technicalHighlights` writing rules to prompt |
| `src/lib/analysis/pipeline/recommendations.ts` | Pass + save `technical_highlights` in insert payload |
| `src/app/portfolio/[id]/page.tsx` | Fetch `technical_highlights`; render 技術面分析 section before reason |

## Expected result on stock detail page

```
AI 分析建議
┌─────────────────────────────────────────────┐
│ 觀望   信心度：55%   來源：投資委員會         │
│                                              │
│ 技術面分析                                   │
│ ▸ 現價低於月線(SMA20=$168.2)，距月線 -2.4%  │
│ ▸ 年線支撐在 $141.2，當前距年線 +16.2%      │
│ ▸ RSI=48，接近中性區間，動能偏弱            │
│ ▸ MACD 呈空頭排列（bearish），賣壓延續      │
│ ▸ 支撐位 $156.8（弱），壓力位 $172.0（強）  │
│                                              │
│ 分析理由                                     │
│ SPCX 目前報 $164.19，雖然...               │
└─────────────────────────────────────────────┘
```
