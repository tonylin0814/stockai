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
  "若資料品質為 missing 或 stale，信心分數上限為 60。若關鍵價格資料為 missing，action 必須是 wait 或 insufficient_data，不得給出 buy 或 small_buy。";

export const SKEPTIC_RULE =
  "你必須至少指出一個可能的錯誤或風險。若真的找不到，必須明確說明為什麼沒有問題。";

export const JSON_STRICT_RULE =
  "重要：只回傳純 JSON 物件，不加 markdown、不加說明文字、不加 ```。JSON 必須完整，不得截斷。所有必填欄位都必須存在。";

export const ACTION_VALUES =
  "可用 action 值（只能用這些）：buy | small_buy | add | hold | wait | watch | reduce | sell | avoid | reject | insufficient_data";

export const NEWS_SENTIMENT_GUIDE = `新聞情緒分析：
若資料包中有新聞（「新聞：」欄位非「無近期新聞」）：
  對每則新聞評分（-2 到 +2）：
  - sentiment：正負情緒（-2=極負面, +2=極正面）
  - price_impact：對股價的潛在影響（-2=重大利空, +2=重大利多）
  - relevance：與該標的的直接相關度（0=無關, +2=直接相關）
  計算加總分數，給出整體新聞傾向（正面/中性/負面）。

若資料包中「新聞：無近期新聞」：
  跳過新聞評分，在 observations 中寫一條：「[新聞] 無近期新聞，無法進行新聞情緒分析」，然後繼續下一階段。
  不要在 dataQualityNotes 重複說明資料不足。`;

export const TECHNICAL_ANALYSIS_GUIDE = `技術面分析（使用資料摘要中已計算的指標）：
- RSI(14)：數值已提供。>70 超買（注意回落風險）、<30 超賣（可能反彈）、50=多空分界
- MACD：信號類型已提供（bullish_cross=金叉買入信號、bearish_cross=死叉賣出信號、bullish=多頭排列、bearish=空頭排列）
- 布林通道：位置已提供（above_upper=突破上軌強勢但超買、near_upper=接近壓力、middle=中性、near_lower=接近支撐、below_lower=跌破下軌弱勢）
- 均線排列：SMA20/SMA50/SMA200 數值已提供。價格>SMA200=長線多頭；SMA20>SMA50=短線多頭
- 趨勢方向：uptrend/downtrend/sideways 已計算
- 近期表現：1W/1M/3M 漲跌幅已提供
- 52週位置：距52週高點百分比已提供（-5%以內=接近高點、-20%以下=明顯回撤）
所有以上數值均在資料摘要「技術：」欄位中，直接使用，不得猜測或假設。`;

export const FUNDAMENTAL_QUALITY_GUIDE = `基本面評估（分兩層）：

**層 1：使用資料包中的量化數據（有才填，無則跳過）**
- PE 本益比：資料中有提供時，判斷是偏高/合理/偏低（科技股合理範圍 15-35x；防禦股 10-20x）
- EPS：正負判斷盈虧；趨勢方向
- 毛利率：>40% 為高品質，<20% 需注意
- 市值：大型股 >100B、中型股 10-100B、小型股 <10B
若資料包中「基本面：基本面資料不足」，層 1 直接跳過，不寫「資料不足」，直接進層 2。

**層 2：使用 AI 訓練知識做定性評估（永遠執行，不依賴資料包）**
以下內容請根據你對此公司/ETF 的訓練知識作答：
- 業務模式：主要收入來源、商業模式穩定性
- 競爭地位：在同業中的排名（龍頭/挑戰者/利基）
- 護城河：是否有品牌、專利、網路效應或成本優勢？（強/中/弱）
- 近年表現：最近 2-3 年獲利趨勢（成長/持平/衰退）
- 主要風險因素：已知的結構性風險（非市場波動）
注意：層 2 是定性分析，不需要數字，明確說明這是基於 AI 訓練知識而非即時資料。`;

export const CATALYST_FRAMEWORK = `催化劑識別（Catalyst Identification）：
- 近期催化劑（1-4 週）：財報、法說會、產品發表、政策、總經數據
- 中期催化劑（1-3 個月）：產業趨勢、訂單能見度、市占變化、匯率
- 長期催化劑（6-12 個月）：技術轉型、新市場、監管環境、資本配置
- 潛在反催化劑（Risk Events）：可能打擊股價的事件或數據
每個催化劑說明：事件名稱、預計時間、對股價的潛在影響（+/- %）、確定性（高/中/低）`;

export const ETF_ANALYSIS_GUIDE = `ETF 分析框架（適用於 securityType=etf）：
1. 費用率（Expense Ratio）：年費率是否合理？（<0.2% 優，0.2-0.5% 可接受，>0.5% 偏高）
2. 基準指數比較：相較於 SPY（S&P 500）或同類 ETF，過去 1M/3M/1Y 表現如何？
3. 溢價/折價：市價相對 NAV 是溢價還是折價？
4. 流動性：平均日成交量是否足夠？成交量太低（<50,000 股/日）代表流動性風險
5. 策略定位：此 ETF 的投資策略（Sharia 合規/ESG/Smart Beta 等）在當前市場環境是否有利？
6. 股息：配息率與頻率是否符合持有目的？
注意：ETF 不適用 Moat、ROIC、Piotroski、EPS 等股票基本面指標，請跳過。`;

export function compactMarketSummary(dataPackage: DailyDataPackage): string {
  const snap = dataPackage.marketSnapshot;

  function formatTechnicals(technicals: TechnicalSummary): string {
    if (technicals.dataPoints < 5) {
      return "技術資料不足";
    }

    const parts: string[] = [];
    if (technicals.rsi14 !== null) parts.push(`RSI=${technicals.rsi14}`);
    if (technicals.macdSignalType) parts.push(`MACD=${technicals.macdSignalType}`);
    if (technicals.bollingerPosition) parts.push(`布林=${technicals.bollingerPosition}`);
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

export function dataPackageJson(dataPackage: DailyDataPackage) {
  return JSON.stringify(dataPackage, null, 2);
}

export function roleLine(identity: PromptIdentity, role: string) {
  return `你是 ${identity.agentName}，${identity.teamName} 的 ${role}。Division：${identity.divisionName}，Division Manager：${identity.divisionManager}。`;
}
