# Codex Prompt 26 — News Section: Surface Tavily Results + Always Show + Richer Display

**Goal**: Tavily web research IS already running (daily, mission, and stock-detail routes all call `runWebResearch`) and feeding earningsNote/analystNote/riskNote/catalystNote to the AI. But these results are never shown to the user — only Finnhub news is displayed, and for stocks like SPCX (private fund) Finnhub returns nothing and the entire section disappears.

Fix: surface Tavily's raw article links on the detail page as news items, and improve the news card design.

**Apply after**: Prompts 01–25 applied.

---

## Problem

1. Tavily results (article titles, URLs, snippets) are synthesized into text notes for the AI but never displayed to the user
2. The detail page only shows Finnhub news: `provider.getNews(security.symbol)`
3. For low-coverage stocks (SPCX, small TW stocks), Finnhub returns `[]` → section disappears entirely

---

## Fix A: Always show the news section with empty state

### File: `src/app/portfolio/[id]/page.tsx`

Replace the entire news block with:

```tsx
{/* 最新新聞 */}
<div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
  <div className="mb-4 flex items-center justify-between">
    <h2 className="text-lg font-semibold text-slate-950">最新新聞</h2>
    {news.length > 0 && (
      <span className="text-xs text-slate-400">{news.length} 則</span>
    )}
  </div>

  {news.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-2 text-2xl">📰</div>
      <p className="text-sm text-slate-500">目前無相關新聞</p>
      <p className="mt-1 text-xs text-slate-400">
        {security.market === "TW"
          ? "台股新聞需透過 AI 分析任務取得"
          : "此標的可能無主流媒體報導，建議手動搜尋"}
      </p>
    </div>
  ) : (
    <div className="space-y-0 divide-y divide-slate-100">
      {news.slice(0, 8).map((item, index) => (
        <div key={index} className="py-3 first:pt-0 last:pb-0">
          {/* Headline */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-700 group-hover:underline leading-snug">
              {item.headline}
            </p>
          </a>

          {/* Summary */}
          {item.summary ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 leading-relaxed">
              {item.summary}
            </p>
          ) : null}

          {/* Meta row: source + date + sentiment */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-600">{item.source}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">{formatDateTime(item.publishedAt)}</span>
            {item.sentiment !== undefined && item.sentiment !== null && (
              <>
                <span className="text-slate-300">·</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  item.sentiment > 0.1
                    ? "bg-green-50 text-green-700"
                    : item.sentiment < -0.1
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-500"
                }`}>
                  {item.sentiment > 0.1 ? "正面" : item.sentiment < -0.1 ? "負面" : "中性"}
                </span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

---

## Fix B: Check `NewsItem` type — ensure `sentiment` field exists

### File: `src/lib/market-data/types.ts`

Find the `NewsItem` type. If `sentiment` is not already there, add it:

```typescript
export type NewsItem = {
  headline: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: number | null;  // -1 to 1, from Finnhub sentiment score
};
```

### File: `src/lib/market-data/finnhub.ts`

Find where news items are mapped and ensure `sentiment` is included if Finnhub provides it.
Finnhub's `/company-news` endpoint returns a `sentiment` field — map it:

```typescript
return data.map((item: FinnhubNewsItem) => ({
  headline: item.headline,
  summary: item.summary ?? "",
  url: item.url,
  source: item.source,
  publishedAt: new Date(item.datetime * 1000).toISOString(),
  sentiment: item.sentiment ?? null  // add this line
}));
```

---

## Fix C: Return raw Tavily article links from `web-research.ts`

### File: `src/lib/analysis/web-research.ts`

#### Update `TavilyResult` type to include `url`

```typescript
type TavilyResult = {
  title?: string;
  content?: string;
  url?: string;
};
```

#### Add `WebResearchArticle` type and `articles` field to `SymbolResearch`

```typescript
export type WebResearchArticle = {
  title: string;
  url: string;
  snippet: string;
  query: string; // "earnings" | "analyst" | "risk" | "catalyst"
};

export type SymbolResearch = {
  symbol: string;
  earningsNote: string;
  analystNote: string;
  riskNote: string;
  catalystNote: string;
  fetchedAt: string;
  articles: WebResearchArticle[]; // ← new: raw links for UI display
};
```

#### Update `tavilySearch` to return structured results instead of a string

Rename/replace `tavilySearch` with a version that returns both the text summary AND the raw article list:

```typescript
async function tavilySearch(query: string, queryType: string): Promise<{
  text: string;
  articles: WebResearchArticle[];
}> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return { text: "", articles: [] };

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) return { text: "", articles: [] };

    const data = (await response.json()) as TavilyResponse;
    const parts: string[] = [];
    const articles: WebResearchArticle[] = [];

    if (data.answer) parts.push(data.answer);

    for (const result of (data.results ?? []).slice(0, 3)) {
      if (result.content) {
        parts.push(`[${result.title ?? "search result"}] ${result.content.slice(0, 300)}`);
      }
      if (result.url && result.title) {
        articles.push({
          title: result.title,
          url: result.url,
          snippet: result.content?.slice(0, 150) ?? "",
          query: queryType
        });
      }
    }

    return { text: parts.join("\n\n"), articles };
  } catch {
    return { text: "", articles: [] };
  }
}
```

#### Update `runWebResearch` to collect articles

In the loop, collect articles from all 4 searches:

```typescript
const [earningsResult, analystResult, riskResult, catalystResult] = await Promise.all([
  tavilySearch(`${item.symbol} ${item.name} next earnings date EPS estimate`, "earnings"),
  tavilySearch(`${item.symbol} ${item.name} analyst rating price target`, "analyst"),
  tavilySearch(`${item.symbol} ${item.name} risk downside concern`, "risk"),
  tavilySearch(`${item.symbol} ${item.name} positive news catalyst upcoming event`, "catalyst")
]);

const allArticles = [
  ...earningsResult.articles,
  ...analystResult.articles,
  ...riskResult.articles,
  ...catalystResult.articles
];

const { research, inputTokens, outputTokens } = await synthesizeResearch(
  client, item.symbol, item.name,
  {
    earnings: earningsResult.text,
    analyst: analystResult.text,
    risk: riskResult.text,
    catalyst: catalystResult.text
  }
);

bySymbol[item.symbol] = { ...research, articles: allArticles };
```

---

## Fix D: Display Tavily articles + Finnhub news together on detail page

### File: `src/app/api/analysis/stock-detail/[holdingId]/route.ts`

After `runWebResearch` runs, return the articles in the API response so the page can use them. Check what the route currently returns and add `webResearchArticles` to the response payload.

### File: `src/app/portfolio/[id]/page.tsx`

The detail page already fetches the latest recommendation. To get Tavily articles, either:
- Fetch from the stock-detail API response (if it returns them), OR
- Query the most recent mission for this holding and extract web research

**Simplest approach**: Pass Tavily articles through the existing `recommendations` query by storing them. But since that's a schema change, use this simpler approach instead:

Add a separate fetch for the latest mission's web research:

```typescript
// After the existing Promise.all, add:
const { data: missionData } = await supabase
  .from("missions")
  .select("id, web_research_result")
  .eq("user_id", user.id)
  .eq("security_id", security.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

const tavilyArticles: WebResearchArticle[] =
  (missionData?.web_research_result as WebResearchResult | null)
    ?.bySymbol?.[security.symbol]?.articles ?? [];
```

Check the actual column name for web research in the missions table — look for `web_research` or similar in the schema.

Then merge Finnhub news with Tavily articles in the display:

```tsx
{/* 最新新聞 */}
<div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
  <div className="mb-4 flex items-center justify-between">
    <h2 className="text-lg font-semibold text-slate-950">最新新聞</h2>
    {(news.length + tavilyArticles.length) > 0 && (
      <span className="text-xs text-slate-400">
        {news.length + tavilyArticles.length} 則
      </span>
    )}
  </div>

  {news.length === 0 && tavilyArticles.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-2 text-2xl">📰</div>
      <p className="text-sm text-slate-500">目前無相關新聞</p>
      <p className="mt-1 text-xs text-slate-400">
        執行 AI 分析後，將透過網路搜尋取得最新報導
      </p>
    </div>
  ) : (
    <div className="divide-y divide-slate-100">
      {/* Finnhub news */}
      {news.slice(0, 5).map((item, i) => (
        <div key={`fh-${i}`} className="py-3 first:pt-0">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-700 group-hover:underline leading-snug">
              {item.headline}
            </p>
          </a>
          {item.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.summary}</p>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-600">{item.source}</span>
            <span>·</span>
            <span>{formatDateTime(item.publishedAt)}</span>
          </div>
        </div>
      ))}

      {/* Tavily web research articles */}
      {tavilyArticles.slice(0, 6).map((article, i) => (
        <div key={`tv-${i}`} className="py-3">
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="group block">
            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-700 group-hover:underline leading-snug">
              {article.title}
            </p>
          </a>
          {article.snippet && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{article.snippet}</p>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
              article.query === "catalyst" ? "bg-green-50 text-green-700" :
              article.query === "risk" ? "bg-red-50 text-red-700" :
              article.query === "analyst" ? "bg-blue-50 text-blue-700" :
              "bg-slate-100 text-slate-600"
            }`}>
              {article.query === "earnings" ? "財報" :
               article.query === "analyst" ? "分析師" :
               article.query === "risk" ? "風險" : "催化劑"}
            </span>
            <span>· AI 網路搜尋</span>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/web-research.ts` | Add `url` to `TavilyResult`; add `WebResearchArticle` type; add `articles` to `SymbolResearch`; update `tavilySearch` to return structured results; collect articles in `runWebResearch` |
| `src/app/portfolio/[id]/page.tsx` | Fetch Tavily articles from latest mission; merge with Finnhub news; show category badges (財報/分析師/風險/催化劑); proper empty state |
| `src/lib/market-data/types.ts` | Add `sentiment?: number \| null` to `NewsItem` (optional) |

## Expected result

**SPCX (no Finnhub coverage):**
```
最新新聞                                        8 則
────────────────────────────────────────────────
SpaceX closes $2B funding round at $350B valuation
Sources say Starlink subscriber growth accelerating...
催化劑 · AI 網路搜尋

SpaceX faces regulatory hurdles for Starship launches
FAA review could delay next test flight by months...
風險 · AI 網路搜尋

Analyst: SPCX premium reflects SpaceX optionality
Fund trading at 12% premium to estimated NAV...
分析師 · AI 網路搜尋
```

**NVDA (Finnhub + Tavily combined):**
```
最新新聞                                       12 則
────────────────────────────────────────────────
[Finnhub articles first...]
[Tavily articles with category badges below...]
```
