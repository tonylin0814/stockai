# Codex Prompt 21 — Adversarial Risk Team + Per-Symbol Accuracy on Detail Page

**Goal**: Two improvements that close the biggest remaining reliability gaps:
1. **Make the risk team genuinely adversarial** — right now it's just "look for risks." After this prompt, the risk team's job is to actively try to destroy the investment thesis proposed by the other 4 teams.
2. **Show per-symbol AI accuracy on the stock detail page** — so you can see "last 3 times AI analysed SPCX: 2 correct, 1 wrong" before deciding whether to follow the latest recommendation.

**Apply after**: Prompts 01–20 applied.

---

## Part A: Adversarial Risk Team

### A1. Add `ADVERSARIAL_RISK_GUIDE` to `src/lib/analysis/prompts/common.ts`

```typescript
export const ADVERSARIAL_RISK_GUIDE = `## 你是反向思考者（Devil's Advocate）

你的任務不是確認其他人的觀點。你的任務是：
**假設其他分析師都傾向看多（或看空），你要找出他們可能錯在哪裡。**

你必須完成以下三個步驟，每一步都必須有具體理由：

**步驟 1：找出論點最弱的環節**
其他團隊最常用哪個理由支持他們的結論？這個理由有什麼你不同意的？
例：「技術團隊說 RSI = 62 偏強，但 62 同樣接近超買區，一旦轉弱容易快速拉回。」

**步驟 2：列出三個具體黑天鵝風險**
什麼事件、消息、或資料點如果出現，會讓目前的多頭/空頭論點完全瓦解？
每條必須是：具體事件 + 觸發條件 + 預估股價影響（%）
例：
- SpaceX 資金周轉問題曝光 → SPCX 可能下跌 30-50%（持有人受困）
- 美聯儲意外緊縮 → 高風險資產普跌，SPCX 作為非流動性資產首當其衝
- 主要機構投資人退出，買方稀少 → 買賣價差擴大，實際成交困難

**步驟 3：判定「可以忽略的風險」vs「必須嚴肅對待的風險」**
不是每個風險都同等重要。判斷標準：
- 機率 × 影響 = 嚴重程度
- 若嚴重程度高，在 action 建議中必須反映（例如：建議比其他團隊更保守）
- 若所有風險都是低機率低影響，可以說明「主要風險均可管理，維持原建議」

**重要規則：**
- 你不得只重複其他資料中已有的風險
- 你不得把「市場波動」或「股市有風險」算作一個具體風險
- 你的 confidence 分數通常應比其他專業團隊低 5-10 分（因為你看到更多下行情境）
- 若你找不到具體風險，你必須說明為什麼（而不是跳過）`;
```

### A2. Update `getRoleGuidance` in `common.ts` for the `risk` role

Find the `risk` role section in the `focus` object:

```typescript
risk: {
  marketReview: "優先分析市場共識可能錯在哪、尾端風險、流動性、槓桿與估值壓力。",
  portfolioReview: "優先做壓力測試：大盤下跌時的脆弱持股、最壞情境、集中風險與停損紀律。",
  missionAnalysis: "優先找出今日最需要降低的風險曝險，以及部位管理和停損調整。",
  marketScan: "優先識別高估值高熱度但支撐薄弱的標的，也可提出防禦或避險候選。",
  teamLeader: "整合風險觀點，確保建議有下行情境、停損條件、部位大小與風險報酬比。"
},
```

Replace with:
```typescript
risk: {
  marketReview: "你是今日市場的懷疑論者。找出市場共識最可能錯在哪裡、誰在承擔看不見的槓桿、哪個板塊估值最脆弱。不要確認多頭觀點，要找出它的漏洞。",
  portfolioReview: "對每一持股進行壓力測試：若大盤下跌 15%，哪些持股最先崩，為什麼？集中風險在哪？停損紀律是否足夠嚴格？你要比其他團隊更保守。",
  missionAnalysis: "假設其他人都傾向執行這個任務（buy/act），你的工作是找出三個可能讓這個決定後悔的具體原因。若找不到，說明為什麼。",
  marketScan: "不要推薦買進標的。你的工作是找出市場中被過度追捧、基礎薄弱、或接近危險水位的標的，提醒投資人避開。",
  teamLeader: "整合來自四個方向的反向觀點，確認最終建議的下行情境、停損條件、部位大小，以及最壞情況發生時的應對計畫。"
},
```

### A3. Inject `ADVERSARIAL_RISK_GUIDE` into leaf agent prompts — only for risk role

In each leaf agent prompt builder (`market-review.ts`, `portfolio-review.ts`, `mission-analysis.ts`, `market-scan.ts`), the `getRoleGuidance()` call already injects role-specific guidance. We need to additionally inject `ADVERSARIAL_RISK_GUIDE` when the team role is `risk`.

**Option A** (simpler): Add it inside `getRoleGuidance()` itself for the risk role.

In `common.ts`, update `getRoleGuidance` to append `ADVERSARIAL_RISK_GUIDE` when role is risk:

```typescript
export function getRoleGuidance(
  teamRole: string | null | undefined,
  agentType: string
): string {
  if (!teamRole) return "";

  const role = teamRole.toLowerCase();
  // ... existing code ...

  let result = `## 本團隊專業角色：${role.toUpperCase()}
你的團隊專長是${name ?? role}。${guidance ?? "請用此專業視角做獨立判斷。"}
請保持這個分析鏡頭，但不要忽略資料品質限制與反方風險。`;

  // For risk team: append the full adversarial guide
  if (role === "risk") {
    result += `\n\n${ADVERSARIAL_RISK_GUIDE}`;
  }

  return result;
}
```

This means `ADVERSARIAL_RISK_GUIDE` must be defined **before** `getRoleGuidance` in `common.ts`. Reorder if needed (move `ADVERSARIAL_RISK_GUIDE` definition above `getRoleGuidance`).

---

## Part B: Per-Symbol AI Accuracy on Stock Detail Page

### B1. Create `src/lib/performance/symbol-accuracy.ts`

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SymbolAccuracy {
  totalEvaluated: number;
  directionallyCorrect: number;
  hitTarget: number;
  hitStopLoss: number;
  avgReturnPct: number | null;
  winRate: number | null; // directionallyCorrect / totalEvaluated * 100
}

export async function getSymbolAccuracy(
  userId: string,
  securityId: string
): Promise<SymbolAccuracy> {
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from("recommendation_outcomes")
    .select(
      "direction_correct, hit_target, hit_stop_loss, return_pct, recommendations!inner(security_id, user_id)"
    )
    .eq("recommendations.user_id", userId)
    .eq("recommendations.security_id", securityId)
    .order("evaluation_date", { ascending: false })
    .limit(20); // last 20 evaluations for this symbol

  const rows = (data ?? []) as Array<{
    direction_correct: boolean | null;
    hit_target: boolean | null;
    hit_stop_loss: boolean | null;
    return_pct: number | null;
  }>;

  if (!rows.length) {
    return {
      totalEvaluated: 0,
      directionallyCorrect: 0,
      hitTarget: 0,
      hitStopLoss: 0,
      avgReturnPct: null,
      winRate: null
    };
  }

  const totalEvaluated = rows.length;
  const directionallyCorrect = rows.filter((r) => r.direction_correct === true).length;
  const hitTarget = rows.filter((r) => r.hit_target === true).length;
  const hitStopLoss = rows.filter((r) => r.hit_stop_loss === true).length;
  const returns = rows.map((r) => r.return_pct).filter((r): r is number => r !== null);
  const avgReturnPct = returns.length
    ? returns.reduce((sum, r) => sum + r, 0) / returns.length
    : null;
  const winRate = totalEvaluated > 0
    ? (directionallyCorrect / totalEvaluated) * 100
    : null;

  return { totalEvaluated, directionallyCorrect, hitTarget, hitStopLoss, avgReturnPct, winRate };
}
```

### B2. Update `src/app/portfolio/[id]/page.tsx`

#### Add import
```typescript
import { getSymbolAccuracy } from "@/lib/performance/symbol-accuracy";
import { RecommendationRating } from "@/components/recommendation-rating";
```

Note: `RecommendationRating` is a default export — check the import syntax matches.

#### Add to data fetching (inside the parallel `Promise.all` or after it)
```typescript
const accuracy = security.id
  ? await getSymbolAccuracy(user.id, security.id)
  : null;
```

#### Add accuracy section to the AI analysis card (inside the `latestRec` block, after key risks)

Add this section after the "主要風險" list inside the AI 分析建議 card:

```tsx
{/* AI 歷史準確率 */}
{accuracy && accuracy.totalEvaluated > 0 && (
  <div className="mt-4 border-t border-slate-100 pt-4">
    <div className="text-sm font-medium text-slate-700">
      此標的 AI 歷史表現（過去 {accuracy.totalEvaluated} 次）
    </div>
    <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
      <div>
        <div className="text-slate-500">方向正確率</div>
        <div className={`font-semibold ${
          accuracy.winRate !== null && accuracy.winRate >= 60
            ? "text-green-700"
            : "text-red-700"
        }`}>
          {accuracy.winRate !== null ? `${accuracy.winRate.toFixed(0)}%` : "—"}
        </div>
      </div>
      <div>
        <div className="text-slate-500">達目標價</div>
        <div className="font-semibold text-slate-900">
          {accuracy.hitTarget}/{accuracy.totalEvaluated}
        </div>
      </div>
      <div>
        <div className="text-slate-500">平均報酬</div>
        <div className={`font-semibold ${
          accuracy.avgReturnPct !== null && accuracy.avgReturnPct >= 0
            ? "text-green-700"
            : "text-red-700"
        }`}>
          {accuracy.avgReturnPct !== null
            ? `${accuracy.avgReturnPct >= 0 ? "+" : ""}${accuracy.avgReturnPct.toFixed(1)}%`
            : "—"}
        </div>
      </div>
    </div>
    {accuracy.totalEvaluated < 3 && (
      <p className="mt-2 text-xs text-slate-400">
        樣本數不足（{accuracy.totalEvaluated} 次），準確率僅供參考。
      </p>
    )}
  </div>
)}

{/* 對最新建議評分 */}
{latestRec && (
  <div className="mt-4 border-t border-slate-100 pt-4">
    <div className="text-sm font-medium text-slate-700 mb-2">對這次建議的評價</div>
    <RecommendationRating
      recommendationId={latestRec.id}
      currentRating={latestRec.user_rating ?? null}
    />
  </div>
)}
```

#### Update `recommendations` query to also fetch `user_rating`

Find the existing recommendations query and ensure `user_rating` is included in the select string:

```typescript
const { data: recommendations } = await supabase
  .from("recommendations")
  .select(
    "id, action, reason, confidence, buy_zone_low, buy_zone_high, target_price, stop_loss, key_risks, time_horizon, source_type, source_name, recommendation_date, created_at, user_rating"
  )
  // ...rest of query
```

And update the `latestRec` type to include `user_rating: string | null`.

---

## Step 3: TypeScript check

```bash
npx tsc --noEmit
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/prompts/common.ts` | Add `ADVERSARIAL_RISK_GUIDE`; update `risk` role guidance in `getRoleGuidance`; append guide to risk role output |
| `src/lib/performance/symbol-accuracy.ts` | **NEW** — queries recommendation_outcomes per symbol |
| `src/app/portfolio/[id]/page.tsx` | Fetch symbol accuracy; display win rate + hit target + avg return; add RecommendationRating for latest rec |

---

## Expected behavior after this prompt

**Risk team (1 of 5 teams)**: Now genuinely tries to find 3 specific black swan risks, explicitly states which are high vs low severity, and recommends a more conservative action than other teams. The team leader must then adjudicate between 4 optimistic teams and 1 adversarial one — which is exactly the dynamic you want.

**Stock detail page**: Shows "方向正確率 67% (2/3 次)" for SPCX if there have been 3 past evaluations. With only 1 stock right now, this will show "樣本數不足，準確率僅供參考" — which is honest. As you run more analyses over time, this becomes genuinely informative.

**Rating widget**: You can now rate "有用/沒用/太積極/太保守/太早" directly from the stock detail page, same as performance/history.
