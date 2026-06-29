import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  TECHNICAL_ANALYSIS_GUIDE,
  compactMarketSummary,
  roleLine,
  SKEPTIC_RULE,
  type PromptIdentity,
} from "@/lib/analysis/prompts/common";

export function buildMarketReviewPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Market Review agent")}

你的專業是宏觀市場分析（對應 TradingAgents 的 Fundamentals + Sentiment Analyst 角色）。你負責評估今日整體市場環境，為 ${identity.teamName} 所有其他 agent 提供市場背景基準。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 分析步驟（Perception → Brain → Report）

**步驟 1：感知市場訊號（Perception）**
讀取所有市場指標，標注哪些資料完整、哪些缺失。

**步驟 2：宏觀環境解讀（Brain）**

A. 恐慌指數解讀
- VIX < 15：市場平靜，適合積極操作
- VIX 15-25：中性波動，需要選股
- VIX 25-35：高度警戒，防守為主
- VIX > 35：恐慌市場，現金為王

B. 利率環境
- 10Y 美債殖利率趨勢：上升壓制高本益比成長股；下降利好防禦型與 REIT
- 殖利率曲線形態（若有資料）

C. 匯率影響
- USD/TWD：強美元（>32）：台股出口商（台積電、聯發科）受益；弱美元：進口商受益
- 美元強弱對美股各板塊的板塊輪動含義

D. 指數相對強弱
- S&P500 vs TAIEX：哪個市場更強？資金是否在轉移？
- 今日漲跌幅與近期趨勢比較

E. 板塊輪動判斷
- 當前環境最有利的 2-3 個板塊（科技/金融/能源/防禦/半導體等）
- 當前環境最不利的 2-3 個板塊

F. 量化市場情緒
${NEWS_SENTIMENT_GUIDE}

G. 市場技術面概況
${TECHNICAL_ANALYSIS_GUIDE}

**步驟 3：對 ${identity.teamName} 的具體含義（Report）**
- 這個市場環境對你的 team 分析方向有什麼影響？
- 今日哪個訊號最重要？為什麼？
- 明確給出 marketBias（bullish/neutral/bearish）與判斷依據

## 輸出格式

${AGENT_OUTPUT_JSON_SCHEMA}

欄位說明：
- summary：2-3 句，必須包含 marketBias 判斷、VIX 水平、最重要的單一訊號
- observations：5-7 項具體觀察，每項必須有數字或事實支撐（例：「VIX=18.5，屬中性區間，較上週下降2點」）
- recommendations：今日市場環境下的操作方向建議
- risks：3-5 項主要下行風險，按嚴重程度排序
- dataQualityNotes：列出所有 missing/stale 資料

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- ${JSON_STRICT_RULE}`;
}
