export type SymbolResearch = {
  symbol: string;
  earningsNote: string;
  analystNote: string;
  riskNote: string;
  catalystNote: string;
  fetchedAt: string;
  articles: WebResearchArticle[];
};

export type WebResearchResult = {
  bySymbol: Record<string, SymbolResearch>;
  totalCostUsd: number;
  symbolCount: number;
};

export type WebResearchArticle = {
  title: string;
  url: string;
  snippet: string;
  query: "earnings" | "analyst" | "risk" | "catalyst";
};

const NO_RECENT_INFO = "No recent information";

type TavilyResult = {
  title?: string;
  content?: string;
  url?: string;
};

type TavilyResponse = {
  results?: TavilyResult[];
  answer?: string;
};

async function tavilySearch(
  query: string,
  queryType: WebResearchArticle["query"]
): Promise<{ text: string; articles: WebResearchArticle[] }> {
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
      if (result.title && result.url) {
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

function firstUsefulLine(text: string) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/\[[^\]]+\]\s*/, "").trim())
      .find((line) => line.length > 0)
      ?.slice(0, 220) || NO_RECENT_INFO
  );
}

function synthesizeResearch(
  symbol: string,
  rawSearchResults: Record<string, string>
): SymbolResearch {
  const fetchedAt = new Date().toISOString();

  if (!Object.values(rawSearchResults).some((value) => value.length > 0)) {
    return {
      symbol,
      earningsNote: "",
      analystNote: "",
      riskNote: "",
      catalystNote: "",
      fetchedAt,
      articles: []
    };
  }

  return {
    symbol,
    earningsNote: firstUsefulLine(rawSearchResults.earnings),
    analystNote: firstUsefulLine(rawSearchResults.analyst),
    riskNote: firstUsefulLine(rawSearchResults.risk),
    catalystNote: firstUsefulLine(rawSearchResults.catalyst),
    fetchedAt,
    articles: []
  };
}

export async function runWebResearch(params: {
  symbols: Array<{ symbol: string; name: string; market: string }>;
}): Promise<WebResearchResult> {
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (!tavilyKey) {
    console.warn("[web-research] Missing Tavily API key, skipping.");
    return { bySymbol: {}, totalCostUsd: 0, symbolCount: 0 };
  }

  const usSymbols = Array.from(
    new Map(
      params.symbols
        .filter((item) => item.market === "US")
        .map((item) => [
          item.symbol.trim().toUpperCase(),
          { ...item, symbol: item.symbol.trim().toUpperCase() }
        ])
    ).values()
  );
  if (!usSymbols.length) return { bySymbol: {}, totalCostUsd: 0, symbolCount: 0 };

  const bySymbol: Record<string, SymbolResearch> = {};

  for (const item of usSymbols) {
    try {
      const [earnings, analyst, risk, catalyst] = await Promise.all([
        tavilySearch(`${item.symbol} ${item.name} next earnings date EPS estimate`, "earnings"),
        tavilySearch(`${item.symbol} ${item.name} analyst rating price target`, "analyst"),
        tavilySearch(`${item.symbol} ${item.name} risk downside concern`, "risk"),
        tavilySearch(`${item.symbol} ${item.name} positive news catalyst upcoming event`, "catalyst")
      ]);
      const articles = [
        ...earnings.articles,
        ...analyst.articles,
        ...risk.articles,
        ...catalyst.articles
      ];
      const research = synthesizeResearch(item.symbol, {
        earnings: earnings.text,
        analyst: analyst.text,
        risk: risk.text,
        catalyst: catalyst.text
      });

      if (
        research.earningsNote === NO_RECENT_INFO &&
        research.analystNote === NO_RECENT_INFO &&
        research.riskNote === NO_RECENT_INFO &&
        research.catalystNote === NO_RECENT_INFO
      ) {
        continue;
      }

      bySymbol[item.symbol] = { ...research, articles };
    } catch (error) {
      console.warn(`[web-research] Failed for ${item.symbol}:`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log(`[web-research] Done. ${usSymbols.length} symbols, Codex mode cost: $0.0000`);

  return { bySymbol, totalCostUsd: 0, symbolCount: usSymbols.length };
}
