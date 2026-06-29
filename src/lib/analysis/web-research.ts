import OpenAI from "openai";

export type SymbolResearch = {
  symbol: string;
  earningsNote: string;
  analystNote: string;
  riskNote: string;
  catalystNote: string;
  fetchedAt: string;
};

export type WebResearchResult = {
  bySymbol: Record<string, SymbolResearch>;
  totalCostUsd: number;
  symbolCount: number;
};

const SYNTHESIS_MODEL = "gpt-4o";
const GPT4O_INPUT_COST_PER_1M = 5;
const GPT4O_OUTPUT_COST_PER_1M = 15;
const NO_RECENT_INFO = "無最新資訊";

type TavilyResult = {
  title?: string;
  content?: string;
};

type TavilyResponse = {
  results?: TavilyResult[];
  answer?: string;
};

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * GPT4O_INPUT_COST_PER_1M +
    (outputTokens / 1_000_000) * GPT4O_OUTPUT_COST_PER_1M
  );
}

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
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) return "";

    const data = (await response.json()) as TavilyResponse;
    const parts: string[] = [];

    if (data.answer) parts.push(data.answer);

    for (const result of (data.results ?? []).slice(0, 3)) {
      if (result.content) {
        parts.push(`[${result.title ?? "search result"}] ${result.content.slice(0, 300)}`);
      }
    }

    return parts.join("\n\n");
  } catch {
    return "";
  }
}

function parseField(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}[：:]\\s*(.+)`, "i"));
  return match?.[1]?.trim() || NO_RECENT_INFO;
}

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
    fetchedAt
  };

  if (!Object.values(rawSearchResults).some((value) => value.length > 0)) {
    return { research: emptyResearch, inputTokens: 0, outputTokens: 0 };
  }

  const prompt = `你是投資研究助理。根據以下搜尋結果，用繁體中文整理 ${symbol}（${name}）的最新投資訊息。

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

請整理成以下四個欄位，每個欄位 1-2 句話。若無相關資料請填「${NO_RECENT_INFO}」。

格式：
財報：...
分析師：...
風險：...
催化劑：...`;

  try {
    const response = await client.chat.completions.create({
      model: SYNTHESIS_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0
    });
    const text = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    return {
      research: {
        symbol,
        earningsNote: parseField(text, "財報"),
        analystNote: parseField(text, "分析師"),
        riskNote: parseField(text, "風險"),
        catalystNote: parseField(text, "催化劑"),
        fetchedAt
      },
      inputTokens,
      outputTokens
    };
  } catch {
    return { research: emptyResearch, inputTokens: 0, outputTokens: 0 };
  }
}

export async function runWebResearch(params: {
  symbols: Array<{ symbol: string; name: string; market: string }>;
}): Promise<WebResearchResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (!openaiKey || !tavilyKey) {
    console.warn("[web-research] Missing API keys, skipping.");
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

  const client = new OpenAI({ apiKey: openaiKey });
  const bySymbol: Record<string, SymbolResearch> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const item of usSymbols) {
    try {
      const [earnings, analyst, risk, catalyst] = await Promise.all([
        tavilySearch(`${item.symbol} ${item.name} next earnings date EPS estimate`),
        tavilySearch(`${item.symbol} ${item.name} analyst rating price target`),
        tavilySearch(`${item.symbol} ${item.name} risk downside concern`),
        tavilySearch(`${item.symbol} ${item.name} positive news catalyst upcoming event`)
      ]);
      const { research, inputTokens, outputTokens } = await synthesizeResearch(
        client,
        item.symbol,
        item.name,
        { earnings, analyst, risk, catalyst }
      );

      if (
        research.earningsNote === NO_RECENT_INFO &&
        research.analystNote === NO_RECENT_INFO &&
        research.riskNote === NO_RECENT_INFO &&
        research.catalystNote === NO_RECENT_INFO
      ) {
        continue;
      }

      bySymbol[item.symbol] = research;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
    } catch (error) {
      console.warn(`[web-research] Failed for ${item.symbol}:`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const totalCostUsd = estimateCost(totalInputTokens, totalOutputTokens);
  console.log(
    `[web-research] Done. ${usSymbols.length} symbols, gpt-4o cost: $${totalCostUsd.toFixed(
      4
    )} (${totalInputTokens} in / ${totalOutputTokens} out tokens)`
  );

  return { bySymbol, totalCostUsd, symbolCount: usSymbols.length };
}
