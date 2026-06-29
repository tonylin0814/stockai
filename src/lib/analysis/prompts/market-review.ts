import type { DailyDataPackage } from "@/lib/analysis/data-package";
import { AGENT_OUTPUT_JSON_SCHEMA } from "@/lib/analysis/schemas";
import {
  DATA_QUALITY_RULE,
  JSON_STRICT_RULE,
  NEWS_SENTIMENT_GUIDE,
  SKEPTIC_RULE,
  TECHNICAL_ANALYSIS_GUIDE,
  compactMarketSummary,
  getRoleGuidance,
  roleLine,
  type PromptIdentity
} from "@/lib/analysis/prompts/common";

export function buildMarketReviewPrompt(
  identity: PromptIdentity,
  dataPackage: DailyDataPackage
) {
  return `${roleLine(identity, "Market Review agent")}

${getRoleGuidance(identity.teamRole, "marketReview")}

你的專業是宏觀市場分析（對應 TradingAgents 的 Fundamentals + Sentiment Analyst 角色）。你負責評估今日整體市場環境，為 ${identity.teamName} 所有其他 agent 提供市場背景基準。

市場資料摘要：
${compactMarketSummary(dataPackage)}

## 分析步驟（Perception -> Brain -> Report）

**步驟 1：感知市場訊號（Perception）**
讀取所有市場指標，標註哪些資料完整、哪些缺失。

**步驟 2：宏觀環境解讀（Brain）**

A. 恐慌指數解讀
VIX 歷史參考區間：通常 < 15 代表低波動環境，15-25 屬正常範圍，25 以上代表市場出現明顯不安，35 以上代表恐慌狀態。
但這只是歷史參考。請結合趨勢（VIX 是升還是降？）、持續時間、以及其他指標共同判斷今日市場情緒。
給出你對當前 VIX 的解讀，以及為什麼你這樣判斷。

B. 利率環境
- 10Y 美債殖利率趨勢：上升通常壓制高本益比成長股；下降通常較有利防禦型與 REIT，但請結合當前市場脈絡判斷。
- 殖利率曲線形態（若有資料）

C. 匯率影響
- USD/TWD：說明目前匯率水準對台股出口商和進口商各自的含義，以及與近期趨勢的比較。不要套用固定匯率門檻做結論。
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
- observations：5-7 項具體觀察，每項必須有數字或事實支撐
- recommendations：今日市場環境下的操作方向建議
- risks：3-5 項主要下行風險，按嚴重程度排序
- dataQualityNotes：列出所有 missing/stale 資料

規則：
- ${DATA_QUALITY_RULE}
- ${SKEPTIC_RULE}
- ${JSON_STRICT_RULE}`;
}
