import { z } from "zod";

export const AGENT_OUTPUT_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    summary: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "object" } },
    risks: { type: "array", items: { type: "string" } },
    dataQualityNotes: { type: "array", items: { type: "string" } },
    confidence: { type: "number" }
  },
  required: ["summary", "observations", "recommendations", "risks", "dataQualityNotes", "confidence"]
} as const;

export const TEAM_REPORT_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    teamName: { type: "string" },
    date: { type: "string" },
    leader: { type: "string" },
    marketView: {
      type: "object",
      properties: {
        summary: { type: "string" },
        marketBias: { type: "string" },
        strongSectors: { type: "array", items: { type: "string" } },
        weakSectors: { type: "array", items: { type: "string" } },
        riskLevel: { type: "string" },
        confidence: { type: "number" }
      },
      required: ["summary", "marketBias", "strongSectors", "weakSectors", "riskLevel", "confidence"]
    },
    portfolioReview: { type: "array", items: { type: "object" } },
    missionAnalysis: { type: ["object", "null"] },
    marketScanRecommendations: { type: "array", items: { type: "object" } },
    finalTeamView: {
      type: "object",
      properties: {
        summary: { type: "string" },
        mostImportantAction: { type: "string" },
        confidence: { type: "number" }
      },
      required: ["summary", "mostImportantAction", "confidence"]
    }
  },
  required: [
    "teamName",
    "date",
    "leader",
    "marketView",
    "portfolioReview",
    "marketScanRecommendations",
    "finalTeamView"
  ]
} as const;

export const DIVISION_DECISION_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    division: { type: "string" },
    divisionManager: { type: "string" },
    marketSummary: { type: "string" },
    portfolioActions: { type: "array", items: { type: "object" } },
    missionDecision: { type: ["object", "null"] },
    topRecommendations: { type: "array", items: { type: "object" } },
    confidence: { type: "number" },
    supportingReasons: { type: "array", items: { type: "string" } },
    opposingReasons: { type: "array", items: { type: "string" } },
    supportingTeams: { type: "array", items: { type: "string" } },
    opposingTeams: { type: "array", items: { type: "string" } },
    internalDisagreements: { type: "array", items: { type: "string" } },
    decisionAction: { type: "string" }
  },
  required: [
    "division",
    "divisionManager",
    "marketSummary",
    "portfolioActions",
    "topRecommendations",
    "confidence",
    "supportingReasons",
    "opposingReasons",
    "supportingTeams",
    "opposingTeams",
    "internalDisagreements",
    "decisionAction"
  ]
} as const;

export const COMMITTEE_DECISION_JSON_SCHEMA_OBJ = {
  type: "object",
  properties: {
    finalAction: { type: "string" },
    actionType: { type: "string" },
    consensusLevel: { type: "string" },
    divisionConclusions: { type: "object" },
    agreements: { type: "array", items: { type: "string" } },
    disagreements: { type: "array", items: { type: "string" } },
    finalBuyZone: { type: "string" },
    finalTargetPrice: { type: "string" },
    finalStopLoss: { type: "string" },
    finalPositionSize: { type: "string" },
    finalRecommendations: { type: "array", items: { type: "object" } },
    confidence: { type: "number" },
    isActionAllowed: { type: "boolean" },
    reason: { type: "string" },
    mostConservativeDivision: { type: "string" },
    mostAggressiveDivision: { type: "string" },
    whatCouldChangeDecision: { type: "array", items: { type: "string" } }
  },
  required: [
    "finalAction",
    "actionType",
    "consensusLevel",
    "divisionConclusions",
    "agreements",
    "disagreements",
    "finalBuyZone",
    "finalTargetPrice",
    "finalStopLoss",
    "finalPositionSize",
    "finalRecommendations",
    "confidence",
    "isActionAllowed",
    "reason",
    "mostConservativeDivision",
    "mostAggressiveDivision",
    "whatCouldChangeDecision"
  ]
} as const;

const FlexibleRecordSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return { value: value == null ? "" : String(value) };
}, z.record(z.string(), z.unknown()));

const FlexibleRecordArraySchema = z
  .preprocess((value) => (Array.isArray(value) ? value : []), z.array(FlexibleRecordSchema))
  .default([]);

const FlexibleTopRecommendationsSchema = z
  .preprocess(
    (value) => (Array.isArray(value) ? value.slice(0, 3) : []),
    z.array(FlexibleRecordSchema)
  )
  .default([]);

const NumericStringSchema = z.preprocess((value) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return value;
}, z.string().min(1));

export const ActionSchema = z.enum([
  "buy",
  "small_buy",
  "add",
  "hold",
  "wait",
  "watch",
  "reduce",
  "sell",
  "avoid",
  "reject",
  "insufficient_data"
]);

export const AgentOutputSchema = z.object({
  summary: z.string(),
  observations: z.array(z.string()).default([]),
  recommendations: FlexibleRecordArraySchema,
  risks: z.array(z.string()).default([]),
  dataQualityNotes: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100)
});

export const MarketViewSchema = z.object({
  summary: z.string(),
  marketBias: z.enum(["bullish", "neutral", "bearish"]),
  strongSectors: z.array(z.string()),
  weakSectors: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(100)
});

export const ScenarioSchema = z.object({
  trigger: z.string(),
  target: z.string(),
  probability: z.number().min(0).max(100),
  timeframe: z.string(),
  action: z.string()
});

export const ScenariosSchema = z.object({
  bull: ScenarioSchema,
  bear: ScenarioSchema,
  base: ScenarioSchema
});

export const PortfolioReviewItemSchema = z.object({
  symbol: z.string(),
  market: z.enum(["US", "TW"]),
  name: z.string(),
  action: z.enum(["buy", "add", "hold", "reduce", "sell", "watch"]),
  reason: z.string(),
  marketImpact: z.string(),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  keyRisks: z.array(z.string()),
  whatCouldChangeOurMind: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  scenarios: ScenariosSchema.optional()
});

export const MissionAnalysisSchema = z.object({
  missionTitle: z.string(),
  missionType: z.string(),
  relatedSymbols: z.array(z.string()),
  summary: z.string(),
  suggestion: z.enum(["buy", "wait", "reject", "hold", "reduce", "sell"]),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  reason: z.string(),
  technicalHighlights: z.array(z.string()).default([]),
  keyRisks: z.array(z.string()),
  conditionsToAct: z.array(z.string()),
  scenarios: ScenariosSchema.optional()
});

export const MarketScanRecommendationSchema = z.object({
  symbol: z.string(),
  market: z.enum(["US", "TW"]),
  name: z.string(),
  signal: z.enum(["bull", "bear", "neutral"]).default("neutral"),
  currentPrice: z.coerce.number().default(0),
  reason: z.string(),
  buyZone: z.string().default("—"),
  targetPrice: NumericStringSchema,
  stopLoss: NumericStringSchema,
  upsidePct: z.coerce.number().default(0),
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  keyRisks: z.array(z.string()).default([]),
  scenarios: ScenariosSchema.optional()
});

export const FinalTeamViewSchema = z.object({
  summary: z.string(),
  mostImportantAction: z.string(),
  confidence: z.number().min(0).max(100)
});

export const TeamReportSchema = z.object({
  teamName: z.string(),
  date: z.string(),
  leader: z.string(),
  marketView: MarketViewSchema,
  portfolioReview: z.array(PortfolioReviewItemSchema),
  missionAnalysis: MissionAnalysisSchema.nullable().optional(),
  marketScanRecommendations: z.array(MarketScanRecommendationSchema),
  finalTeamView: FinalTeamViewSchema
});

export const DivisionDecisionSchema = z.object({
  division: z.string(),
  divisionManager: z.string(),
  marketSummary: z.string(),
  portfolioActions: FlexibleRecordArraySchema,
  missionDecision: FlexibleRecordSchema,
  topRecommendations: FlexibleTopRecommendationsSchema,
  confidence: z.number().min(0).max(100),
  supportingReasons: z.array(z.string()),
  opposingReasons: z.array(z.string()),
  supportingTeams: z.array(z.string()),
  opposingTeams: z.array(z.string()),
  internalDisagreements: z.array(z.string()),
  decisionAction: z.enum(["buy", "small_buy", "hold", "wait", "reduce", "sell", "avoid"])
});

export const CommitteeDecisionSchema = z.object({
  finalAction: z.enum(["act", "no_action"]),
  actionType: z.enum(["buy", "small_buy", "hold", "wait", "reduce", "sell", "avoid"]),
  consensusLevel: z.enum(["strong", "weak", "none"]),
  divisionConclusions: FlexibleRecordSchema,
  agreements: z.array(z.string()),
  disagreements: z.array(z.string()),
  finalBuyZone: z.string(),
  finalTargetPrice: z.string(),
  finalStopLoss: z.string(),
  finalScenarios: ScenariosSchema.optional(),
  finalPositionSize: z.string(),
  finalRecommendations: FlexibleRecordArraySchema,
  confidence: z.number().min(0).max(100),
  isActionAllowed: z.boolean(),
  reason: z.string(),
  mostConservativeDivision: z.string(),
  mostAggressiveDivision: z.string(),
  whatCouldChangeDecision: z.array(z.string())
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Scenarios = z.infer<typeof ScenariosSchema>;
export type MissionAnalysis = z.infer<typeof MissionAnalysisSchema>;
export type TeamReport = z.infer<typeof TeamReportSchema>;
export type DivisionDecision = z.infer<typeof DivisionDecisionSchema>;
export type CommitteeDecision = z.infer<typeof CommitteeDecisionSchema>;
export type TwScanPick = z.infer<typeof MarketScanRecommendationSchema>;

const SCENARIOS_JSON_EXAMPLE = `{
        "bull": {
          "trigger": "breaks above resistance with volume confirmation",
          "target": "upside target or range",
          "probability": 35,
          "timeframe": "4-8 weeks",
          "action": "recommended action if bull case triggers"
        },
        "bear": {
          "trigger": "breaks below support or risk event appears",
          "target": "downside target or risk level",
          "probability": 40,
          "timeframe": "2-4 weeks",
          "action": "recommended defensive action if bear case triggers"
        },
        "base": {
          "trigger": "range-bound or no clear direction",
          "target": "consolidation range",
          "probability": 25,
          "timeframe": "2-3 weeks",
          "action": "recommended action while base case holds"
        }
      }`;

export const TEAM_REPORT_JSON_SCHEMA = `{
  "teamName": "基本面品質團隊",
  "date": "YYYY-MM-DD",
  "leader": "林品妍 Sophia Lin",
  "marketView": {
    "summary": "今日觀點",
    "marketBias": "bullish | neutral | bearish",
    "strongSectors": ["強勢產業"],
    "weakSectors": ["弱勢產業"],
    "riskLevel": "low | medium | high",
    "confidence": 0
  },
  "portfolioReview": [
    {
      "symbol": "AAPL",
      "market": "US",
      "name": "Apple",
      "action": "buy | add | hold | reduce | sell | watch",
      "reason": "原因",
      "marketImpact": "目前市場對此標的的影響",
      "buyZone": "建議買進或加碼區間",
      "targetPrice": "目標價",
      "stopLoss": "停損點",
      "keyRisks": ["主要風險"],
      "whatCouldChangeOurMind": ["改變判斷的條件"],
      "confidence": 0,
      "scenarios": ${SCENARIOS_JSON_EXAMPLE}
    }
  ],
  "missionAnalysis": null | {
    "note": "null when running daily analysis with no active mission; populated only in mission mode",
    "missionTitle": "每日分析",
    "missionType": "daily",
    "relatedSymbols": [],
    "summary": "任務分析摘要",
    "suggestion": "buy | wait | reject | hold | reduce | sell",
    "buyZone": "建議買進區間",
    "targetPrice": "目標價",
    "stopLoss": "停損點",
    "timeHorizon": "short | swing | long",
    "confidence": 0,
    "reason": "原因",
    "technicalHighlights": [
      "現價高於月線(SMA20=152.3)，距月線 +4.9%，短線偏強",
      "年線支撐在 141.2，當前距年線 +9.6%",
      "RSI=62，偏強但未超買"
    ],
    "keyRisks": ["主要風險"],
    "conditionsToAct": ["需要等待的條件"],
    "scenarios": ${SCENARIOS_JSON_EXAMPLE}
  },
  "marketScanRecommendations": [
    {
      "symbol": "2330",
      "market": "TW",
      "name": "台積電",
      "signal": "bull",
      "currentPrice": 920,
      "reason": "現價 920 高於 SMA50=905，RSI=58 尚未過熱，目標 1050 代表約 +14.1%，停損 870。",
      "buyZone": "建議買進區間",
      "targetPrice": "1050",
      "stopLoss": "870",
      "upsidePct": 14.1,
      "timeHorizon": "short | swing | long",
      "confidence": 0,
      "keyRisks": ["主要風險"],
      "scenarios": ${SCENARIOS_JSON_EXAMPLE}
    }
  ],
  "finalTeamView": {
    "summary": "團隊總結",
    "mostImportantAction": "今日最重要建議",
    "confidence": 0
  }
}`;

export const AGENT_OUTPUT_JSON_SCHEMA = `{
  "summary": "分析摘要",
  "observations": ["主要觀察"],
  "recommendations": [],
  "risks": ["主要風險"],
  "dataQualityNotes": ["資料品質說明"],
  "confidence": 0
}`;

export const DIVISION_DECISION_JSON_SCHEMA = `{
  "division": "GPT Division",
  "divisionManager": "Monica",
  "marketSummary": "今日市場觀點",
  "portfolioActions": [],
  "missionDecision": {
    "missionTitle": "每日例行分析",
    "suggestion": "buy | wait | hold | reduce | sell | reject",
    "summary": "任務分析綜合摘要",
    "reason": "採取此建議的主要理由",
    "buyZone": "建議買進區間（若適用）",
    "targetPrice": "目標價（若適用）",
    "stopLoss": "停損點（若適用）",
    "timeHorizon": "short | swing | long",
    "confidence": 0,
    "keyRisks": ["主要風險"],
    "conditionsToAct": ["需要成立的條件才採取行動"],
    "scenarios": ${SCENARIOS_JSON_EXAMPLE}
  },
  "topRecommendations": [],
  "confidence": 0,
  "supportingReasons": ["支持理由"],
  "opposingReasons": ["反對理由"],
  "supportingTeams": ["支持 team"],
  "opposingTeams": ["反對 team"],
  "internalDisagreements": ["內部分歧"],
  "decisionAction": "buy | small_buy | hold | wait | reduce | sell | avoid"
}`;

export const COMMITTEE_DECISION_JSON_SCHEMA = `{
  "finalAction": "act | no_action",
  "actionType": "buy | small_buy | hold | wait | reduce | sell | avoid",
  "consensusLevel": "strong | weak | none",
  "divisionConclusions": {},
  "agreements": ["同意點"],
  "disagreements": ["分歧點"],
  "finalBuyZone": "最終買進區間",
  "finalTargetPrice": "最終目標價",
  "finalStopLoss": "最終停損點",
  "finalScenarios": ${SCENARIOS_JSON_EXAMPLE},
  "finalPositionSize": "最終建議部位大小",
  "finalRecommendations": [],
  "confidence": 0,
  "isActionAllowed": false,
  "reason": "採取或不採取行動的理由",
  "mostConservativeDivision": "最保守 division",
  "mostAggressiveDivision": "最積極 division",
  "whatCouldChangeDecision": ["會改變最終決策的資料"]
}`;
