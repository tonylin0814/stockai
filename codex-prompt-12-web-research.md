# Codex Prompt 12 — Web Research via Tavily + gpt-4o (網路研究層)

**Goal**: Add a web research step that runs BEFORE both divisions start. Uses Tavily API to search the web for each portfolio/watchlist symbol, then uses `gpt-4o` (Chat Completions — same API already in codebase) to synthesize results into a structured Chinese summary. Results are stored in `DailyDataPackage.webResearch` and shared equally by both GPT Division and Claude Division.

**Key principles**:
- **Tavily** handles search (simple fetch, no SDK needed, 1000 free/month)
- **gpt-4o** handles synthesis (NOT gpt-5.5 — web research doesn't need the most powerful model, gpt-4o is sufficient and cheaper)
- Both divisions receive identical `webResearch` data — no information asymmetry
- Silent fail on any error — pipeline never blocked

**Environment variable required**: `TAVILY_API_KEY` (already added to Vercel)

**Apply after**: Prompts 01–11 applied.

---

## Architecture

```
buildDailyDataPackage()             ← 現有：價格、技術、基本面
        ↓
runWebResearch(symbols)             ← 新增
  ├─ Tavily search (per symbol)     ← 抓網路原始資料
  └─ gpt-4o synthesis (per symbol)  ← 整理成中文摘要（用現有 Chat Completions API）
        ↓
dataPackage.webResearch             ← 注入資料包
        ↓
┌────────────────┐  ┌────────────────┐
│  GPT Division  │  │Claude Division │  ← 兩邊看到相同資料
└────────────────┘  └────────────────┘
        ↓                   ↓
      委員會決策
```

Web research 在 `daily/route.ts` 的 `buildDailyDataPackage()` 之後、`runDivisionPipeline()` 之前執行。

---

## Step 1: Create `src/lib/analysis/web-research.ts`

```typescript
import OpenAI from "openai";

export type SymbolResearch = {
  symbol: string;
  earningsNote: string;   // 財報日期和預估
  analystNote: string;    // 分析師評等/目標價
  riskNote: string;       // 近期風險和負面消息
  catalystNote: string;   // 近期催化劑/正面消息
  fetchedAt: string;      // ISO timestamp
};

export type WebResearchResult = {
  bySymbol: Record<string, SymbolResearch>;
  totalCostUsd: number;
  symbolCount: number;
};

// Always use gpt-4o for synthesis — NOT gpt-5.5
// Web research synthesis does not require the most capable model
const SYNTHESIS_MODEL = "gpt-4o";
const GPT4O_INPUT_COST_PER_1M = 5;
const GPT4O_OUTPUT_COST_PER_1M = 15;

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * GPT4O_INPUT_COST_PER_1M +
    (outputTokens / 1_000_000) * GPT4O_OUTPUT_COST_PER_1M
  );
}

// ─── Step A: Tavily Search ───────────────────────────────────────────────────

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type TavilyResponse = {
  results?: TavilyResult[];
  answer?: string;
};

async function tavilySearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "";

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        search_depth: "basic",
        include_answer: true,   // Tavily's own AI summary
        include_raw_content: false,
      }),
    });

    if (!response.ok) return "";

    const data = (await response.json()) as TavilyResponse;

    // Combine Tavily's answer + top result snippets
    const parts: string[] = [];

    if (data.answer) {
      parts.push(data.answer);
    }

    for (const result of (data.results ?? []).slice(0, 3)) {
      if (result.content) {
        parts.push(`[${result.title}] ${result.content.slice(0, 300)}`);
      }
    }

    return parts.join("\n\n");
  } catch {
    return "";
  }
}

// ─── Step B: gpt-4o Synthesis ────────────────────────────────────────────────

async function synthesizeResearch(
  client: OpenAI,
  symbol: string,
  name: string,
  rawSearchResults: Record<string, string>
): Promise<{ research: SymbolResearch; inputTokens: number; outputTokens: number }> {
  const fetchedAt = new Date().toISOString();

  const emptyResearch: SymbolResearch = {
    symbol,
    earningsNote: "",
    analystNote: "",
    riskNote: "",
    catalystNote: "",
    fetchedAt,
  };

  // If all searches returned empty, skip synthesis
  const hasData = Object.values(rawSearchResults).some((v) => v.length > 0);
  if (!hasData) {
    return { research: emptyResearch, inputTokens: 0, outputTokens: 0 };
  }

  const prompt = `你是投資研究助理。根據以下搜尋結果，用繁體中文整理 ${symbol}（${name}）的最新投資資訊。

搜尋結果：
---
財報相關：
${rawSearchResults.earnings || "無結果"}

分析師評等：
${rawSearchResults.analyst || "無結果"}

風險消息：
${rawSearchResults.risk || "無結果"}

催化劑/正面消息：
${rawSearchResults.catalyst || "無結果"}
---

請整理成以下四個欄位，每個欄位 1-2 句話，若無相關資料請填「無最新資訊」：

1. 財報：（下一次財報日期、EPS預估）
2. 分析師：（評等共識、平均目標價）
3. 風險：（近期主要風險或負面消息）
4. 催化劑：（近期正面消息或即將到來的事件）

格式：
財報：...
分析師：...
風險：...
催化劑：...`;

  try {
    const response = await client.chat.completions.create({
      model: SYNTHESIS_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 400,
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    // Parse the four fields
    const earningsMatch = text.match(/財報[：:]\s*(.+)/);
    const analystMatch = text.match(/分析師[：:]\s*(.+)/);
    const riskMatch = text.match(/風險[：:]\s*(.+)/);
    const catalystMatch = text.match(/催化劑[：:]\s*(.+)/);

    return {
      research: {
        symbol,
        earningsNote: earningsMatch?.[1]?.trim() ?? "無最新資訊",
        analystNote: analystMatch?.[1]?.trim() ?? "無最新資訊",
        riskNote: riskMatch?.[1]?.trim() ?? "無最新資訊",
        catalystNote: catalystMatch?.[1]?.trim() ?? "無最新資訊",
        fetchedAt,
      },
      inputTokens,
      outputTokens,
    };
  } catch {
    return { research: emptyResearch, inputTokens: 0, outputTokens: 0 };
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Runs web research for all US portfolio + watchlist symbols.
 *
 * Flow per symbol:
 *   1. Run 4 Tavily searches in parallel (earnings, analyst, risk, catalyst)
 *   2. Synthesize with gpt-4o into structured Chinese summary
 *
 * TW stocks are skipped (limited English web content, not cost-effective).
 * All errors are silently swallowed — pipeline never blocked.
 */
export async function runWebResearch(params: {
  symbols: Array<{ symbol: string; name: string; market: string }>;
}): Promise<WebResearchResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (!openaiKey || !tavilyKey) {
    console.warn("[web-research] Missing API keys, skipping.");
    return { bySymbol: {}, totalCostUsd: 0, symbolCount: 0 };
  }

  // Only US stocks — TW stocks have limited English web content
  const usSymbols = params.symbols.filter((s) => s.market === "US");
  if (!usSymbols.length) {
    return { bySymbol: {}, totalCostUsd: 0, symbolCount: 0 };
  }

  const client = new OpenAI({ apiKey: openaiKey });
  const bySymbol: Record<string, SymbolResearch> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const sym of usSymbols) {
    try {
      // Step A: 4 Tavily searches in parallel per symbol
      const [earnings, analyst, risk, catalyst] = await Promise.all([
        tavilySearch(`${sym.symbol} ${sym.name} next earnings date 2026 EPS estimate`),
        tavilySearch(`${sym.symbol} ${sym.name} analyst rating price target 2026`),
        tavilySearch(`${sym.symbol} ${sym.name} risk downside concern 2026`),
        tavilySearch(`${sym.symbol} ${sym.name} positive news catalyst upcoming event 2026`),
      ]);

      // Step B: gpt-4o synthesis (uses existing Chat Completions API)
      const { research, inputTokens, outputTokens } = await synthesizeResearch(
        client,
        sym.symbol,
        sym.name,
        { earnings, analyst, risk, catalyst }
      );

      // Only save if we got meaningful content
      if (
        research.earningsNote !== "無最新資訊" ||
        research.analystNote !== "無最新資訊" ||
        research.riskNote !== "無最新資訊"
      ) {
        bySymbol[sym.symbol] = research;
      }

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

    } catch (err) {
      // Silent fail per symbol — never block pipeline
      console.warn(`[web-research] Failed for ${sym.symbol}:`, err);
    }

    // Small delay between symbols to respect Tavily rate limits
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const totalCostUsd = estimateCost(totalInputTokens, totalOutputTokens);
  // Note: Tavily cost ($0.01/search × 4 searches × N symbols) is not tracked here
  // but is very small (e.g. 10 symbols = $0.40 Tavily + ~$0.04 gpt-4o)

  console.log(
    `[web-research] Done. ${usSymbols.length} symbols, ` +
    `gpt-4o cost: $${totalCostUsd.toFixed(4)} ` +
    `(${totalInputTokens} in / ${totalOutputTokens} out tokens)`
  );

  return { bySymbol, totalCostUsd, symbolCount: usSymbols.length };
}
```

---

## Step 2: Add `webResearch` to `DailyDataPackage`

In `src/lib/analysis/data-package.ts`:

**Import:**
```typescript
import type { WebResearchResult } from "@/lib/analysis/web-research";
```

**Add field to type:**
```typescript
export type DailyDataPackage = {
  packageDate: string;
  userId: string;
  portfolio: PortfolioItem[];
  watchlist: WatchlistItem[];
  marketSnapshot: { ... };
  dataQualitySummary: { ... };
  upcomingEarnings: EarningsEvent[];      // prompt 11
  decisionMemory: string;                 // prompt 08
  webResearch: WebResearchResult | null;  // ADD — prompt 12
};
```

**In `buildDailyDataPackage()`, add default null:**
```typescript
return {
  // ... existing fields ...
  upcomingEarnings,
  decisionMemory,
  webResearch: null, // populated in route.ts after this function returns
};
```

---

## Step 3: Call `runWebResearch` in route files

### `src/app/api/analysis/daily/route.ts`

**Add import:**
```typescript
import { runWebResearch } from "@/lib/analysis/web-research";
```

**After `buildDailyDataPackage()`:**
```typescript
const dataPackage = await buildDailyDataPackage(user.id);

// Web research: Tavily search → gpt-4o synthesis
// Uses gpt-4o (NOT gpt-5.5) — synthesis doesn't need the most capable model
// Results shared by BOTH GPT Division and Claude Division
const allSymbols = [
  ...dataPackage.portfolio.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    market: item.market as string,
  })),
  ...dataPackage.watchlist.map((item) => ({
    symbol: item.symbol,
    name: item.name,
    market: item.market as string,
  })),
];
const webResearch = await runWebResearch({ symbols: allSymbols });
dataPackage.webResearch = webResearch;
```

### `src/app/api/analysis/mission/[id]/route.ts`

Apply the identical change — find where `buildDailyDataPackage()` is called and add the same `runWebResearch()` block immediately after.

---

## Step 4: Inject into `compactMarketSummary`

In `src/lib/analysis/prompts/common.ts`:

**Add import:**
```typescript
import type { WebResearchResult } from "@/lib/analysis/web-research";
```

**Add `formatWebResearch` inside `compactMarketSummary()`:**
```typescript
function formatWebResearch(
  symbol: string,
  webResearch: WebResearchResult | null | undefined
): string {
  if (!webResearch) return "";
  const r = webResearch.bySymbol[symbol];
  if (!r) return "";

  const lines: string[] = [`[網路研究 ${symbol} — ${r.fetchedAt.slice(0, 10)}]`];
  if (r.earningsNote && r.earningsNote !== "無最新資訊") lines.push(`財報：${r.earningsNote}`);
  if (r.analystNote && r.analystNote !== "無最新資訊") lines.push(`分析師：${r.analystNote}`);
  if (r.riskNote && r.riskNote !== "無最新資訊") lines.push(`風險：${r.riskNote}`);
  if (r.catalystNote && r.catalystNote !== "無最新資訊") lines.push(`催化劑：${r.catalystNote}`);

  return lines.length > 1 ? lines.join("\n") : "";
}
```

**For each portfolio and watchlist item, append web research after existing fields:**
```typescript
// After formatting technicals / fundamentals / news for each item:
const webNote = formatWebResearch(item.symbol, dataPackage.webResearch);
if (webNote) {
  itemLines.push(webNote);
}
```

---

## Step 5: Update `FUNDAMENTAL_QUALITY_GUIDE`

In `src/lib/analysis/prompts/common.ts`, add Layer 3 after existing Layer 2:

```typescript
export const FUNDAMENTAL_QUALITY_GUIDE = `基本面評估（分三層）：

**層 1：API 量化數據...** （現有內容保留）

**層 2：AI 訓練知識定性評估...** （現有內容保留）

**層 3：網路研究資料（若資料摘要中有 [網路研究] 區塊）**
優先使用這些即時資訊，它們比訓練知識更新：
- 財報日期：若 14 天內有財報，必須在風險評估中反映
- 分析師評等：多數買入 → 可略微提升信心；多數持有/賣出 → 保守
- 風險：若有具體近期風險，必須出現在 risks 欄位
- 催化劑：正面催化劑可支持更積極的行動建議`;
```

---

## Cost estimate per mission run

| 持股數 | Tavily (4次/股) | gpt-4o 合成 | 合計 |
|--------|----------------|-------------|------|
| 3 stocks | $0.12 | ~$0.02 | **~$0.14** |
| 5 stocks | $0.20 | ~$0.03 | **~$0.23** |
| 10 stocks | $0.40 | ~$0.06 | **~$0.46** |

Tavily 免費額度：1000次/月 = 250次搜尋（4次/stock）= **62 個 mission runs 免費**

---

## Verification

1. `npx tsc --noEmit` — no errors
2. Run a mission with SPCX in portfolio
3. Check server logs:
   ```
   [web-research] Done. 1 symbols, gpt-4o cost: $0.0041 (820 in / 180 out tokens)
   ```
4. Check `pipeline_agent_runs` — agent prompt should contain:
   ```
   [網路研究 SPCX — 2026-06-29]
   財報：預計 2026年8月6日盤後公布 Q2 財報，EPS 預估 $0.32
   分析師：6 買入 / 3 持有 / 1 賣出，平均目標價 $187
   風險：鎖定期約 7 月中旬到期，可能造成短期賣壓
   催化劑：Starship 軌道酬載交付目標 2026 下半年
   ```
5. If `TAVILY_API_KEY` missing → logs warning → `webResearch: null` → pipeline continues normally

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/web-research.ts` | **CREATE** — Tavily search + gpt-4o synthesis |
| `src/lib/analysis/data-package.ts` | Add `webResearch: WebResearchResult \| null` to type |
| `src/app/api/analysis/daily/route.ts` | Add `runWebResearch()` after `buildDailyDataPackage()` |
| `src/app/api/analysis/mission/[id]/route.ts` | Same — add `runWebResearch()` call |
| `src/lib/analysis/prompts/common.ts` | Add `formatWebResearch()` + Layer 3 to guide |
