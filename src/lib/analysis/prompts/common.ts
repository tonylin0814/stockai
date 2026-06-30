import type { DailyDataPackage } from "@/lib/analysis/data-package";
import type { WebResearchResult } from "@/lib/analysis/web-research";
import type { EarningsEvent } from "@/lib/market-data/earnings-calendar";
import type { TechnicalSummary } from "@/lib/market-data/indicators";
import type { Fundamentals, NewsItem } from "@/lib/market-data/types";

export type PromptIdentity = {
  agentName: string;
  teamName: string;
  teamLeader: string;
  divisionName: string;
  divisionManager: string;
  teamRole?: string | null;
};

export function getRoleGuidance(
  teamRole: string | null | undefined,
  agentType: string
): string {
  if (!teamRole) return "";

  const role = teamRole.toLowerCase();
  const roleNames: Record<string, string> = {
    technical: "技術分析",
    fundamental: "基本面深度研究",
    macro: "總體經濟與市場環境",
    sentiment: "市場情緒、新聞催化劑與消息面",
    risk: "風險評估、壓力測試與反向思考"
  };
  const focus: Record<string, Record<string, string>> = {
    technical: {
      marketReview: "優先分析指數趨勢、支撐壓力、RSI/MACD、布林通道、量價結構與強勢板塊輪動。",
      portfolioReview: "優先檢視持股趨勢、均線排列、RSI/MACD 訊號、關鍵支撐/壓力與停損位置。",
      missionAnalysis: "優先找出今日最明確的技術買賣訊號，以及需要等待確認的價格條件。",
      marketScan: "優先尋找突破、拉回支撐、超賣反彈與相對強勢標的。",
      teamLeader: "整合技術面證據，確保進場、停損與目標價有清楚的技術依據。"
    },
    fundamental: {
      marketReview: "優先分析市場估值、企業獲利趨勢、品質股與弱質股的估值差距。",
      portfolioReview: "優先檢視商業模式、護城河、估值合理性、財務品質與長期成長動能。",
      missionAnalysis: "優先找出基本面惡化警訊、估值回到合理區間的優質標的與今日重要基本面變化。",
      marketScan: "優先尋找基本面優質但短期錯殺、估值明顯低估或財報優於預期的標的。",
      teamLeader: "整合基本面觀點，確保建議有估值、護城河與財務品質依據。"
    },
    macro: {
      marketReview: "優先分析利率、匯率、通膨、PMI、就業、資金流向與地緣政治風險。",
      portfolioReview: "優先檢視持股對利率、匯率、景氣循環與板塊輪動的敏感度。",
      missionAnalysis: "優先判斷總體環境是否支持進攻，或應降低風險曝險。",
      marketScan: "優先尋找當前總經環境中的結構受益標的或被總經逆風過度錯殺的標的。",
      teamLeader: "整合總體觀點，確保建議符合目前市場時機與板塊環境。"
    },
    sentiment: {
      marketReview: "優先分析新聞流、投資人情緒、催化事件、分析師預期與市場敘事變化。",
      portfolioReview: "優先檢視每檔持股近期新聞情緒、催化劑、預期是否過熱或過度悲觀。",
      missionAnalysis: "優先找出今日最重要新聞、即將發生的催化劑與情緒極端造成的機會或風險。",
      marketScan: "優先尋找具正面催化、負面新聞過度反應或市場情緒極端的標的。",
      teamLeader: "整合情緒與催化劑觀點，避免追高炒作，也不要忽略被錯殺的機會。"
    },
    risk: {
      marketReview: "你是今日市場的懷疑論者。找出市場共識最可能錯在哪裡、誰在承擔看不見的槓桿、哪個板塊估值最脆弱。不要確認多頭觀點，要找出它的漏洞。",
      portfolioReview: "對每一持股進行壓力測試：若大盤下跌 15%，哪些持股最先崩，為什麼？集中風險在哪？停損紀律是否足夠嚴格？你要比其他團隊更保守。",
      missionAnalysis: "假設其他人都傾向執行這個任務（buy/act），你的工作是找出三個可能讓這個決定後悔的具體原因。若找不到，說明為什麼。",
      marketScan: "不要推薦買進標的。你的工作是找出市場中被過度追捧、基礎薄弱、或接近危險水位的標的，提醒投資人避開。",
      teamLeader: "整合來自四個方向的反向觀點，確認最終建議的下行情境、停損條件、部位大小，以及最壞情況發生時的應對計畫。"
    }
  };

  const name = roleNames[role];
  const guidance = focus[role]?.[agentType];
  if (!name && !guidance) return "";

  let result = `## 本團隊專業角色：${role.toUpperCase()}
你的團隊專長是${name ?? role}。${guidance ?? "請用此專業視角做獨立判斷。"}
請保持這個分析鏡頭，但不要忽略資料品質限制與反方風險。`;

  if (role === "risk") {
    result += `\n\n${ADVERSARIAL_RISK_GUIDE}`;
  }

  return result;
}

export const DATA_QUALITY_RULE = `## 資料品質與信心度規則（強制執行）

**資料品質對信心的硬上限：**
| 資料品質 | 信心上限 |
| --- | --- |
| fresh | 90 |
| delayed | 75 |
| stale | 55 |
| missing | 40 |
| conflicting | 50 |

若多個股票的資料品質不同，以最差的那個決定整體信心上限。

**財報風險降低信心：**
- 財報日在 7 天內 → 信心再降 10
- 財報日在 8-14 天內 → 信心再降 5

**關鍵資料缺失對行動的限制：**
- 現價 missing → action 只能是 wait 或 insufficient_data，禁止 buy / small_buy / add
- 現價 stale → action 只能是 watch 或 wait，不得 buy
- 基本面和新聞同時缺失 → confidence 不超過 50

**高信心的最低證據要求：**
- confidence > 75 → reason 欄位必須引用至少 3 個具體數字
- confidence > 85 → 必須引用至少 5 個具體數字，且資料品質必須是 fresh
- confidence = 90 只保留給資料完整、技術/基本面/新聞一致、無即將財報且有明確催化劑的情況`;

export const CONFIDENCE_CALIBRATION_GUIDE = `## 信心度校準指引（Confidence Calibration）

信心度不是「你感覺多有把握」，而是「根據現有資料，這個判斷正確的客觀機率」。

**校準錨點：**
- 60 = 比隨機猜測稍好，資料不完整或有明顯矛盾
- 70 = 合理判斷，主要技術或基本面指標支持，但有一個以上重要未知因素
- 80 = 強力判斷，多個獨立指標一致，無即將財報，資料品質 fresh
- 85 = 非常強力，技術+基本面+新聞三者一致，有具體催化劑，部位風險可控
- 90 = 所有指標一致、資料完整、多重確認，此分數應非常少見

**常見錯誤（不得犯）：**
- 資料只有價格和成交量，卻給 80+
- 無法解釋為何是這個信心數字
- 所有分析都給 75-85，造成信心通膨
- 好消息 = 高信心，壞消息 = 低信心`;

export const SKEPTIC_RULE =
  "你必須至少指出一個可能的錯誤或風險。若真的找不到，必須明確說明為什麼沒有問題。";

export const JSON_STRICT_RULE =
  "重要：最終 JSON 必須是純 JSON 物件，不加 markdown、不加 ```。若前文要求先輸出可審核摘要，請在 ---JSON_START--- 後只輸出 JSON。JSON 必須完整，不得截斷。所有必填欄位都必須存在。";

export const REASONING_SCRATCHPAD_RULE = `## 必要證據審核摘要（先寫摘要，後寫 JSON）

在輸出 JSON 之前，請先完成以下「可審核摘要」。這不是逐步內心推理，不要輸出隱藏思考過程；只列出可被使用者檢查的證據、反方論點與信心校準。

**A. 資料點引用（Data Citation）**
列出你從資料包中實際讀到的 3-5 個具體數字或事實，每條用「→」標示其分析含義。若資料 missing 或不足，必須明確寫出「[資料缺失] xxx 無資料」。

**B. 最強反方論點（Devil's Argument）**
寫出一個具體且難以反駁的反方觀點。不得只寫「市場有風險」。

**C. 信心度自評（Confidence Calibration）**
寫出：「資料品質 [X]，[Y] 個具體數字支持，信心上限 [Z]，最終決定信心 [N]。」

---JSON_START---
（在此行之後輸出 JSON，JSON 前不要有任何其他文字）`;

export const ADVERSARIAL_RISK_GUIDE = `## 你是反向思考者（Devil's Advocate）

你的任務不是確認其他人的觀點。你的任務是：假設其他分析師都傾向看多（或看空），你要找出他們可能錯在哪裡。

你必須完成以下三個步驟，每一步都要有具體理由：

**步驟 1：找出論點最弱的環節**
其他團隊最常用哪個理由支持他們的結論？這個理由有什麼你不同意的？

**步驟 2：列出三個具體黑天鵝風險**
每條必須是：具體事件 + 觸發條件 + 預估股價影響（%）。不得把「市場波動」當作具體風險。

**步驟 3：區分可忽略風險與必須嚴肅對待的風險**
以「機率 × 影響」判斷嚴重程度；若嚴重程度高，action 建議必須更保守。若找不到具體風險，必須說明原因。`;

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
所有以上數值均在資料摘要「技術：」欄位中，直接使用，不得猜測或假設。

**K線形態判讀：**
- hammer / morning_star → 底部反轉訊號，需配合成交量確認
- shooting_star / evening_star → 頂部反轉訊號，注意壓力
- bullish_engulfing / bearish_engulfing → 強力反轉，當日收盤方向優先
- doji → 多空拉鋸，等待方向確認後再行動

**支撐壓力判讀：**
- 支撐(強) → 曾多次測試守穩，可作為停損參考點
- 壓力(強) → 曾多次突破失敗，突破需放量確認
- 現價距支撐/壓力的百分比自行計算，用來判斷風險報酬比

**量能訊號：**
- breakout_volume → 放量上漲，突破訊號可信度較高
- selloff_volume → 放量下跌，賣壓沉重，避免逢低承接
- drying_up → 縮量整理，通常為蓄勢，等待方向選擇`;

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

export const TAIWAN_FUNDAMENTAL_GUIDE = `台股 API 基本面資料（若有）：
- TWSE 本益比：與台股同業比較，電子業常見合理區間約 15-25x，傳產約 10-15x。
- 殖利率：台股投資人重視配息，殖利率 > 5% 通常有支撐，但仍需檢查配息是否可持續。
- 股價淨值比：> 3x 需要高成長支撐，< 1x 可能是價值機會，也可能是基本面警訊。
- 月營收年增率：若資料提供，連續正成長偏多，連續下滑需保守。`;

export const WEB_RESEARCH_GUIDE = `網路研究資料（若資料摘要中有 [網路研究] 區塊）：
- 優先使用這些即時資訊，因為它們比模型訓練知識更新。
- 財報日期：若 14 天內有財報，必須在風險評估中反映。
- 分析師評等：多數買入可略微提高信心；多數持有或賣出應偏保守。
- 風險：若有具體近期風險，必須出現在 risks 欄位。
- 催化劑：正面催化劑可支持更積極的行動建議，但仍需搭配價格與資料品質。`;

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

export const SCENARIO_ANALYSIS_GUIDE = `## Bull / Bear / Base scenario analysis

For every holding or recommendation you analyze, provide all three scenarios. The three probabilities must add up to 100.

Bull case:
- trigger: specific technical, fundamental, news, or catalyst condition that confirms upside.
- target: upside target price, range, or percentage outcome.
- probability: probability from 0 to 100.
- timeframe: estimated time to play out.
- action: what to do if the bull case triggers.

Bear case:
- trigger: specific condition that confirms downside or requires defense.
- target: downside target, support level, or expected drawdown.
- probability: probability from 0 to 100.
- timeframe: estimated time to play out.
- action: stop-loss, reduce, hedge, or avoid action if the bear case triggers.

Base case:
- trigger: condition that means no clear direction or range-bound trading.
- target: consolidation range or neutral outcome.
- probability: probability from 0 to 100.
- timeframe: estimated duration.
- action: what to do while the base case holds.

Rules:
- bull + bear + base probability must equal 100.
- Triggers must be concrete and observable, not vague.
- If exact price data is insufficient, describe targets by percentage.
- For ETFs, use benchmark-relative logic instead of single-company target-price logic.`;

export const EARNINGS_RISK_GUIDE = `財報風險管理原則：
若「即將到來的財報」欄位顯示有標的在 14 天內公布財報：
- 7 天內：高度謹慎。不建議在財報前建立新倉位。若已持有，考慮降低至核心部位或設定保護性停損。
- 8-14 天內：中度謹慎。可持有但不宜追高；若要買進，先用小部位試探。
- 15-45 天內：低度提醒。正常分析，但在 conditionsToAct 中加入「等待財報確認方向後再加碼」。
財報是二元事件，即使方向看對，也可能因預期過高而下跌。若是上市後首次財報，不確定性更高，謹慎程度應提高一級。`;

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
    if (technicals.candlePattern) parts.push(`K線形態=${technicals.candlePattern}`);
    if (technicals.nearestSupport !== null) {
      parts.push(
        `支撐=${technicals.nearestSupport}${
          technicals.supportStrength === "strong" ? "(強)" : "(弱)"
        }`
      );
    }
    if (technicals.nearestResistance !== null) {
      parts.push(
        `壓力=${technicals.nearestResistance}${
          technicals.resistanceStrength === "strong" ? "(強)" : "(弱)"
        }`
      );
    }
    if (technicals.volumeSignal && technicals.volumeSignal !== "normal") {
      parts.push(`量能=${technicals.volumeSignal}`);
    }

    return parts.join(" ") || "無技術資料";
  }

  function formatFundamentals(fundamentals: Fundamentals | null, market?: string): string {
    if (!fundamentals || fundamentals.qualityState === "missing") {
      return "基本面資料不足";
    }

    const parts: string[] = [];
    if (market === "TW") {
      if (fundamentals.twsePeRatio != null) {
        parts.push(`本益比(TWSE)=${fundamentals.twsePeRatio.toFixed(1)}x`);
      }
      if (fundamentals.twseDividendYield != null) {
        parts.push(`殖利率=${fundamentals.twseDividendYield.toFixed(2)}%`);
      }
      if (fundamentals.twsePbRatio != null) {
        parts.push(`股價淨值比=${fundamentals.twsePbRatio.toFixed(2)}x`);
      }
      if (fundamentals.monthlyRevenueNote) {
        parts.push(fundamentals.monthlyRevenueNote);
      } else if (fundamentals.monthlyRevenueYoY != null) {
        const sign = fundamentals.monthlyRevenueYoY >= 0 ? "+" : "";
        parts.push(`月營收年增=${sign}${fundamentals.monthlyRevenueYoY.toFixed(1)}%`);
      }
    }
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

  function formatWebResearch(
    symbol: string,
    webResearch: WebResearchResult | null | undefined
  ): string {
    const research = webResearch?.bySymbol[symbol];
    if (!research) return "";

    const lines = [`[網路研究 ${symbol} - ${research.fetchedAt.slice(0, 10)}]`];
    if (research.earningsNote && research.earningsNote !== "無最新資訊") {
      lines.push(`財報：${research.earningsNote}`);
    }
    if (research.analystNote && research.analystNote !== "無最新資訊") {
      lines.push(`分析師：${research.analystNote}`);
    }
    if (research.riskNote && research.riskNote !== "無最新資訊") {
      lines.push(`風險：${research.riskNote}`);
    }
    if (research.catalystNote && research.catalystNote !== "無最新資訊") {
      lines.push(`催化劑：${research.catalystNote}`);
    }

    return lines.length > 1 ? lines.join("\n") : "";
  }

  function formatWebResearchSection(
    webResearch: WebResearchResult | null | undefined
  ): string {
    if (!webResearch) return "";

    const entries = Object.keys(webResearch.bySymbol)
      .sort()
      .map((symbol) => formatWebResearch(symbol, webResearch))
      .filter(Boolean);

    return entries.length ? `## 網路研究\n${entries.join("\n")}` : "";
  }

  function formatEarningsCalendar(events: EarningsEvent[]): string {
    if (!events.length) return "";

    const lines = ["## 即將到來的財報（45天內）"];
    for (const event of events) {
      const urgency =
        event.daysUntil <= 7
          ? "本週"
          : event.daysUntil <= 14
            ? "兩週內"
            : `${event.daysUntil}天後`;
      const timing =
        event.hour === "bmo"
          ? "盤前公布"
          : event.hour === "amc"
            ? "盤後公布"
            : event.hour === "dmh"
              ? "盤中公布"
              : "";
      const eps =
        event.epsEstimate !== null
          ? ` | EPS預估 $${event.epsEstimate.toFixed(2)}`
          : "";

      lines.push(
        `- ${urgency} ${event.symbol}：Q${event.quarter} ${event.year} 財報 ${event.date}${
          timing ? `（${timing}）` : ""
        }${eps}`
      );
    }

    return lines.join("\n");
  }

  const portfolio = (dataPackage.portfolio ?? [])
    .map((holding) => {
      const isEtf = holding.securityType?.toLowerCase() === "etf";
      const label = isEtf ? "ETF" : "股票";
      const fundamentalLine = isEtf
        ? `ETF資料：${formatFundamentals(holding.fundamentals, holding.market)}；請使用 ETF 分析框架，跳過股票基本面指標`
        : `基本面：${formatFundamentals(holding.fundamentals, holding.market)}`;

      return `${holding.symbol}(${holding.market}) [${label}] 持股${holding.shares}股 成本${holding.averageCost} 現價${holding.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(holding.technicals)}\n  ${fundamentalLine}\n  新聞：${formatNews(holding.news)}`;
    })
    .join("\n");
  const watchlist = (dataPackage.watchlist ?? [])
    .map((item) => {
      const isEtf = item.securityType?.toLowerCase() === "etf";
      const label = isEtf ? "ETF" : "股票";
      const fundamentalLine = isEtf
        ? `ETF資料：${formatFundamentals(item.fundamentals, item.market)}；請使用 ETF 分析框架，跳過股票基本面指標`
        : `基本面：${formatFundamentals(item.fundamentals, item.market)}`;

      return `${item.symbol}(${item.market}) [${label}] 目標買入${item.targetBuyPrice ?? "N/A"} 現價${item.currentPrice ?? "N/A"}\n  技術：${formatTechnicals(item.technicals)}\n  ${fundamentalLine}\n  新聞：${formatNews(item.news)}`;
    })
    .join("\n");
  const earningsSection = formatEarningsCalendar(dataPackage.upcomingEarnings ?? []);
  const webResearchSection = formatWebResearchSection(dataPackage.webResearch);

  return `日期：${dataPackage.packageDate}
市場指標：TAIEX ${snap?.taiex?.price ?? "N/A"} | S&P500 ${snap?.sp500?.price ?? "N/A"} | VIX ${snap?.vix?.price ?? "N/A"} | USD/TWD ${snap?.usdTwd ?? "N/A"} | 10Y美債 ${snap?.tenYearYield?.value ?? "N/A"}%
${earningsSection ? `\n${earningsSection}\n` : ""}
${webResearchSection ? `\n${webResearchSection}\n` : ""}
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
