import type { DailyDataPackage } from "@/lib/analysis/data-package";
import type { TechnicalSummary } from "@/lib/market-data/indicators";
import type { Fundamentals, NewsItem } from "@/lib/market-data/types";

export type PromptIdentity = {
  agentName: string;
  teamName: string;
  teamLeader: string;
  divisionName: string;
  divisionManager: string;
};

export const DATA_QUALITY_RULE =
  "若資料品質為 missing 或 stale，信心分數上限為 60。若關鍵資料為 missing，action 必須是 wait 或 insufficient_data，不得給出 buy 或 small_buy。";

export const SKEPTIC_RULE =
  "你必須至少指出一個可能的錯誤或風險。若真的找不到，必須明確說明為什麼沒有問題。";

export const JSON_STRICT_RULE =
  "重要：只回傳純 JSON 物件，不加 markdown、不加說明文字、不加 ```。JSON 必須完整，不得截斷。所有必填欄位都必須存在。";

export const ACTION_VALUES =
  "可用 action 值（只能用這些）：buy | small_buy | add | hold | wait | watch | reduce | sell | avoid | reject | insufficient_data";

// From PrimoAgent: quantified news sentiment scoring
export const NEWS_SENTIMENT_GUIDE = `量化新聞情緒評分（每項 -2 到 +2 分）：
- news_relevance：新聞與該標的的直接相關程度（-2=無關, +2=高度相關）
- sentiment：正面/負面情緒（-2=極度負面, +2=極度正面）
- price_impact_potential：對股價的潛在影響力（-2=重大利空, +2=重大利多）
- trend_direction：新聞是否符合近期趨勢（-2=逆趨勢, +2=順趨勢）
- earnings_impact：對獲利的預期影響（-2=嚴重損害, +2=顯著提升）
- investor_confidence：對投資人信心的影響（-2=打擊信心, +2=大幅提振）
若無新聞資料，請在 dataQualityNotes 說明並跳過評分。`;

// From TradingAgents: technical indicator analysis
export const TECHNICAL_ANALYSIS_GUIDE = `技術面分析重點（若有相關資料）：
- RSI(14)：>70 超買、<30 超賣、50 為多空分界
- MACD：金叉/死叉訊號、柱狀圖縮放方向
- 布林通道：股價相對上/中/下軌位置，突破上軌=強勢，突破下軌=弱勢
- 移動平均線：SMA20/SMA50/SMA200 多空排列（價格在 200 日均線上方=長線多頭）
- ADX：>25 代表有明確趨勢；<20 代表整理震盪
若無法取得技術指標，需在 dataQualityNotes 說明。`;

// From InvestSkill: fundamental quality scoring framework
export const FUNDAMENTAL_QUALITY_GUIDE = `基本面品質評估（使用已知資訊推斷，不得編造數字）：
1. 護城河（Economic Moat）：品牌力、網路效應、成本優勢、轉換成本、規模效應 - 強/中/弱/無法判斷
2. 資本報酬率：ROIC 或 ROE 是否持續 > 15%？是否有惡化趨勢？
3. 盈利品質（Piotroski 概念）：
   - 獲利性：近期是否盈利？現金流是否為正？
   - 槓桿：負債是否增加？流動性是否充足？
   - 效率：毛利率/營業利益率趨勢是否向上？
4. 估值脈絡：相對於歷史 P/E 或同業，目前股價偏貴/合理/便宜？
5. 競爭地位：在同業中排名如何？有無受到新對手威脅？
若資料包中無財務數據，在各項後標註「資料不足，無法評估」。`;

// From Agentic Financial Analyst: structured catalyst framework
export const CATALYST_FRAMEWORK = `催化劑識別（Catalyst Identification）：
- 近期催化劑（1-4 週）：財報、法說會、產品發表、政策、總經數據
- 中期催化劑（1-3 個月）：產業趨勢、訂單能見度、市占變化、匯率
- 長期催化劑（6-12 個月）：技術轉型、新市場、監管環境、資本配置
- 潛在反催化劑（Risk Events）：可能打擊股價的事件或數據
每個催化劑說明：事件名稱、預計時間、對股價的潛在影響（+/- %）、確定性（高/中/低）`;

// For ETF analysis - replaces stock fundamental framework
export const ETF_ANALYSIS_GUIDE = `ETF 分析框架（適用於 securityType=etf）：
1. 費用率（Expense Ratio）：年費率是否合理？（<0.2% 優，0.2-0.5% 可接受，>0.5% 偏高）
2. 基準指數比較：相較於 SPY（S&P 500）或同類 ETF，過去 1M/3M/1Y 表現如何？
3. 溢價/折價：市價相對 NAV 是溢價還是折價？
4. 流動性：平均日成交量是否足夠？成交量太低（<50,000 股/日）代表流動性風險
5. 策略定位：此 ETF 的投資策略（Sharia 合規/ESG/Smart Beta 等）在當前市場環境是否有利？
6. 股息：配息率與頻率是否符合持有目的？
注意：ETF 不適用 Moat、ROIC、Piotroski、EPS 等股票基本面指標，請跳過。`;

/**
 * Compact market context for leaf agents - replaces full dataPackageJson.
 * Reduces token usage while preserving decision-critical data.
 */
export function compactMarketSummary(dataPackage: DailyDataPackage): string {
  const snap = dataPackage.marketSnapshot;

  function formatTechnicals(technicals: TechnicalSummary): string {
    if (technicals.dataPoints < 5) {
      return "技術資料不足";
    }

    const parts: string[] = [];
    if (technicals.rsi14 !== null) parts.push(`RSI=${technicals.rsi14}`);
    if (technicals.sma20 !== null) parts.push(`SMA20=${technicals.sma20}`);
    if (technicals.sma50 !== null) parts.push(`SMA50=${technicals.sma50}`);
    if (technicals.sma200 !== null) parts.push(`SMA200=${technicals.sma200}`);
    if (technicals.trendDirection !== "insufficient_data") {
      parts.push(`趨勢=${technicals.trendDirection}`);
    }
    if (technicals.pctFrom52wHigh !== null) {
      parts.push(`距52W高點=${technicals.pctFrom52wHigh}%`);
    }
    if (technicals.change1w !== null) parts.push(`1W=${technicals.change1w}%`);
    if (technicals.change1m !== null) parts.push(`1M=${technicals.change1m}%`);
    if (technicals.change3m !== null) parts.push(`3M=${technicals.change3m}%`);

    return parts.join(" ") || "無技術資料";
  }

  function formatFundamentals(fundamentals: Fundamentals | null): string {
    if (!fundamentals || fundamentals.qualityState === "missing") {
      return "基本面資料不足";
    }

    const parts: string[] = [];
    if (fundamentals.pe != null) parts.push(`PE=${fundamentals.pe.toFixed(1)}`);
    if (fundamentals.eps != null) parts.push(`EPS=${fundamentals.eps.toFixed(2)}`);
    if (fundamentals.grossMargin != null) {
      parts.push(`毛利率=${(fundamentals.grossMargin * 100).toFixed(1)}%`);
    }
    if (fundamentals.marketCap != null) {
      parts.push(`市值=${(fundamentals.marketCap / 1e9).toFixed(1)}B`);
    }
    if (fundamentals.expenseRatio != null) {
      parts.push(`費用率=${(fundamentals.expenseRatio * 100).toFixed(2)}%`);
    }
    if (fundamentals.yield != null) {
      parts.push(`殖利率=${(fundamentals.yield * 100).toFixed(2)}%`);
    }
    if (fundamentals.ytdReturn != null) {
      parts.push(`YTD=${(fundamentals.ytdReturn * 100).toFixed(1)}%`);
    }
    if (fundamentals.threeYearAverageReturn != null) {
      parts.push(`3Y年化=${(fundamentals.threeYearAverageReturn * 100).toFixed(1)}%`);
    }

    return parts.join(" ") || "資料不足";
  }

  function formatNews(news: NewsItem[]): string {
    if (!news.length) {
      return "無近期新聞";
    }

    return news
      .slice(0, 3)
      .map((item) => `[${item.publishedAt.slice(0, 10)}] ${item.headline}`)
      .join(" | ");
  }

  const portfolio = (dataPackage.portfolio ?? [])
    .map((holding) => {
      const isEtf = holding.securityType?.toLowerCase() === "etf";
      const label = isEtf ? "ETF" : "股票";
      const fundamentalLine = isEtf
        ? `ETF資料：${formatFundamentals(holding.fundamentals)}；請使用 ETF 分析框架，跳過股票基本面指標`
        : `基本面：${formatFundamentals(holding.fundamentals)}`;

      return `${holding.symbol}(${holding.market}) [${label}] 持股${holding.shares}股 成本${holding.averageCost} 現價${holding.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(holding.technicals)}\n  ${fundamentalLine}\n  新聞：${formatNews(holding.news)}`;
    })
    .join("\n");
  const watchlist = (dataPackage.watchlist ?? [])
    .map((item) => {
      const isEtf = item.securityType?.toLowerCase() === "etf";
      const label = isEtf ? "ETF" : "股票";
      const fundamentalLine = isEtf
        ? `ETF資料：${formatFundamentals(item.fundamentals)}；請使用 ETF 分析框架，跳過股票基本面指標`
        : `基本面：${formatFundamentals(item.fundamentals)}`;

      return `${item.symbol}(${item.market}) [${label}] 目標買入${item.targetBuyPrice ?? "N/A"} 現價${item.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(item.technicals)}\n  ${fundamentalLine}\n  新聞：${formatNews(item.news)}`;
    })
    .join("\n");

  return `日期：${dataPackage.packageDate}
市場指標：TAIEX ${snap?.taiex?.price ?? "N/A"} | S&P500 ${snap?.sp500?.price ?? "N/A"} | VIX ${snap?.vix?.price ?? "N/A"} | USD/TWD ${snap?.usdTwd ?? "N/A"} | 10Y美債 ${snap?.tenYearYield?.value ?? "N/A"}%
持股：
${portfolio || "無"}
關注清單：
${watchlist || "無"}
資料品質：${JSON.stringify(dataPackage.dataQualitySummary ?? {})}`;
}

// Keep for backward compatibility but leaf agents should use compactMarketSummary instead
export function dataPackageJson(dataPackage: DailyDataPackage) {
  return JSON.stringify(dataPackage, null, 2);
}

export function roleLine(identity: PromptIdentity, role: string) {
  return `你是 ${identity.agentName}，${identity.teamName} 的 ${role}。Division：${identity.divisionName}，Division Manager：${identity.divisionManager}。`;
}
