import type { z } from "zod";
import type { DataQualityState } from "@/lib/market-data/types";

const CODEX_MODEL_NAME = "codex-local";

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function approximateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export function maxOutputTokens() {
  return Math.round(envNumber("ANALYSIS_MAX_OUTPUT_TOKENS", 2500));
}

export type ModelCallResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  tokenCount: number;
};

export function inputSummary(prompt: string) {
  return prompt.replace(/\s+/g, " ").slice(0, 200);
}

export function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractJsonFromOutput(text: string) {
  const marker = "---JSON_START---";
  const markedIndex = text.lastIndexOf(marker);
  const candidate = markedIndex >= 0 ? text.slice(markedIndex + marker.length) : text;
  const stripped = stripJsonFence(candidate);
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1).trim();
  }

  return stripped;
}

export function parseJson(text: string): unknown {
  return JSON.parse(extractJsonFromOutput(text));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultScenarios() {
  return {
    bull: {
      trigger: "價格突破壓力並伴隨成交量放大",
      target: "上方壓力區",
      probability: 30,
      timeframe: "2-6 weeks",
      action: "等待確認後再評估加碼"
    },
    bear: {
      trigger: "跌破近期支撐或資料品質轉差",
      target: "下方支撐區",
      probability: 35,
      timeframe: "1-4 weeks",
      action: "降低風險或暫停新倉"
    },
    base: {
      trigger: "價格維持區間整理",
      target: "區間震盪",
      probability: 35,
      timeframe: "2-4 weeks",
      action: "保持觀望並等待更明確訊號"
    }
  };
}

function schemaKeys(schema?: object) {
  const properties = (schema as { properties?: Record<string, unknown> } | undefined)?.properties;
  return new Set(Object.keys(properties ?? {}));
}

function inferOfflinePayload(params: { prompt: string; outputSchema?: object }) {
  const keys = schemaKeys(params.outputSchema);
  const prompt = params.prompt;
  const cautiousReason =
    "已改用 Codex 零成本模式，系統根據現有資料做保守結構化判讀；因未呼叫付費模型，需等價格、量能、基本面與新聞資料更完整後再提高信心。";

  if (keys.has("summary") && keys.has("observations") && keys.has("dataQualityNotes")) {
    return {
      summary: "Codex 零成本模式完成初步判讀，暫不建議積極行動。",
      observations: [
        "目前依賴系統已收集的行情、技術與資料品質欄位。",
        "未使用 付費外部 AI API，因此不產生模型費用。"
      ],
      recommendations: [],
      risks: ["資料不足時容易低估事件風險，建議等待更明確訊號。"],
      dataQualityNotes: ["本次分析為 Codex 零成本模式輸出，費用記錄為 0。"],
      confidence: 40
    };
  }

  if (keys.has("teamName") && keys.has("marketView") && keys.has("finalTeamView")) {
    return {
      teamName: "Codex Team",
      date: today(),
      leader: "Codex",
      marketView: {
        summary: "市場訊號尚未強到支持積極行動。",
        marketBias: "neutral",
        strongSectors: [],
        weakSectors: [],
        riskLevel: "medium",
        confidence: 40
      },
      portfolioReview: [],
      missionAnalysis: null,
      marketScanRecommendations: [],
      finalTeamView: {
        summary: "維持保守觀望，優先保護資金並等待確認。",
        mostImportantAction: "wait",
        confidence: 40
      }
    };
  }

  if (keys.has("division") && keys.has("decisionAction")) {
    return {
      division: "Codex Division",
      divisionManager: "Codex",
      marketSummary: "Codex 零成本模式綜合團隊輸出後，給出保守觀望結論。",
      portfolioActions: [],
      missionDecision: {
        missionTitle: "Codex Analysis",
        missionType: "codex",
        relatedSymbols: [],
        summary: "目前不採取新行動。",
        suggestion: "wait",
        buyZone: "不適用",
        targetPrice: "不適用",
        stopLoss: "不適用",
        timeHorizon: "swing",
        confidence: 40,
        reason: cautiousReason,
        technicalHighlights: [],
        keyRisks: ["資料不足或市場快速轉向。"],
        conditionsToAct: ["價格與量能確認", "基本面或新聞資料補齊"],
        scenarios: defaultScenarios()
      },
      topRecommendations: [],
      confidence: 40,
      supportingReasons: ["避免付費 API 成本，先保留決策彈性。"],
      opposingReasons: ["缺少完整語言模型深度推理，信心需保守。"],
      supportingTeams: ["Codex Team"],
      opposingTeams: [],
      internalDisagreements: [],
      decisionAction: "wait"
    };
  }

  if (keys.has("finalAction") && keys.has("consensusLevel")) {
    return {
      finalAction: "no_action",
      actionType: "wait",
      consensusLevel: "none",
      divisionConclusions: { mode: "codex-local" },
      agreements: ["目前資訊不足，先不採取新交易行動。"],
      disagreements: [],
      finalBuyZone: "不適用",
      finalTargetPrice: "不適用",
      finalStopLoss: "不適用",
      finalScenarios: defaultScenarios(),
      finalPositionSize: "不適用",
      finalRecommendations: [],
      confidence: 40,
      isActionAllowed: false,
      reason: cautiousReason,
      mostConservativeDivision: "Codex Division",
      mostAggressiveDivision: "Codex Division",
      whatCouldChangeDecision: ["資料品質改善", "出現明確價格突破或風險解除"]
    };
  }

  if (prompt.includes('"decisions"')) {
    return {
      decisions: [],
      noActionReason: "Codex 零成本模式預設保守，今日不新增模擬交易。",
      marketAssessment: "市場需要更多確認訊號。"
    };
  }

  if (prompt.includes('"trades_summary"')) {
    return {
      trades_summary: "今日未透過付費模型產生交易建議，維持既有風險控管。",
      positions_review: "持倉以現有價格與風險標記檢視，未新增高風險操作。",
      market_commentary: "市場方向仍需等待更清楚的量價與總體訊號。",
      tomorrow_outlook: "明日優先觀察主要指數、持股支撐壓力與成交量是否確認。",
      planned_actions: "除非出現明確突破或跌破關鍵支撐，否則保持觀望。"
    };
  }

  if (prompt.includes("scanSummary")) {
    return { scanSummary: "Codex 零成本模式暫未找到高信心掃描標的。", picks: [] };
  }

  return {
    sentiment: "neutral",
    sentimentReason: "Codex 零成本模式採保守中性判斷。",
    picksUnder50: [],
    picksUnder100: [],
    picksUnder200: [],
    etfPicks: []
  };
}

export function enforceConfidenceCap(
  confidence: number,
  context: {
    worstQualityState?: DataQualityState | null;
    daysUntilEarnings?: number | null;
    fundamentalsAndNewsMissing?: boolean;
  } = {}
) {
  const qualityCaps: Record<DataQualityState, number> = {
    fresh: 90,
    delayed: 75,
    stale: 55,
    missing: 40,
    conflicting: 50
  };
  let cap = context.worstQualityState ? qualityCaps[context.worstQualityState] : 90;

  if (context.fundamentalsAndNewsMissing) {
    cap = Math.min(cap, 50);
  }

  if (context.daysUntilEarnings !== null && context.daysUntilEarnings !== undefined) {
    if (context.daysUntilEarnings <= 7) {
      cap -= 10;
    } else if (context.daysUntilEarnings <= 14) {
      cap -= 5;
    }
  }

  return Math.max(0, Math.min(confidence, cap));
}

export async function callModel(params: {
  provider: string;
  model: string;
  prompt: string;
  budget?: {
    userId: string;
    dailyRunId?: string | null;
    missionId?: string | null;
  };
  maxOutputTokens?: number;
  outputSchema?: object;
}): Promise<ModelCallResult> {
  const promptTokens = approximateTokens(params.prompt);
  const text = JSON.stringify(inferOfflinePayload(params));

  return {
    text,
    promptTokens,
    completionTokens: approximateTokens(text),
    estimatedCostUsd: 0,
    tokenCount: promptTokens + approximateTokens(text)
  };
}

export async function validateOrRepair<T>(params: {
  rawText: string;
  schema: z.ZodType<T>;
  schemaDescription: string;
  provider: string;
  model: string;
  budget?: {
    userId: string;
    dailyRunId?: string | null;
    missionId?: string | null;
  };
}) {
  try {
    return {
      parsed: params.schema.parse(parseJson(params.rawText)),
      repaired: false,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      tokenCount: 0
    };
  } catch {
    const repairPrompt = [
      "Repair the following malformed JSON.",
      "Return exactly one complete JSON object and nothing else.",
      "Do not use markdown fences, comments, explanations, or trailing text.",
      "Close every string, array, and object. Remove invalid trailing commas.",
      "The repaired JSON must match this schema exactly:",
      params.schemaDescription,
      "Malformed JSON input:",
      params.rawText
    ].join("\n\n");
    const repairResult = await callModel({
      provider: params.provider,
      model: params.model,
      prompt: repairPrompt,
      budget: params.budget,
      maxOutputTokens: Math.min(2500, maxOutputTokens())
    });

    return {
      parsed: params.schema.parse(parseJson(repairResult.text)),
      repaired: true,
      promptTokens: repairResult.promptTokens,
      completionTokens: repairResult.completionTokens,
      estimatedCostUsd: repairResult.estimatedCostUsd,
      tokenCount: repairResult.tokenCount
    };
  }
}
