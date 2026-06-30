import { z } from "zod";

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
  reason: z.string(),
  buyZone: z.string(),
  targetPrice: z.string(),
  stopLoss: z.string(),
  timeHorizon: z.enum(["short", "swing", "long"]),
  confidence: z.number().min(0).max(100),
  keyRisks: z.array(z.string()),
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
  missionAnalysis: MissionAnalysisSchema,
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
  "missionAnalysis": {
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
      "reason": "推薦理由",
      "buyZone": "建議買進區間",
      "targetPrice": "目標價",
      "stopLoss": "停損點",
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
