import { getFamilyId, savePipelineAgentRun } from "@/lib/analysis/pipeline/db";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import { writeRecommendations } from "@/lib/analysis/pipeline/recommendations";
import {
  MissionAnalysisSchema,
  type DivisionDecision,
  type MissionAnalysis
} from "@/lib/analysis/schemas";
import type { MissionDataPackage } from "@/lib/analysis/mission-package";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const QUICK_SINGLE_STOCK_SCHEMA = `{
  "missionTitle": "任務標題",
  "missionType": "single_stock",
  "relatedSymbols": ["2409"],
  "summary": "簡短結論",
  "suggestion": "buy | wait | reject | hold | reduce | sell",
  "buyZone": "建議買進區間，沒有就填 不適用",
  "targetPrice": "目標價，沒有就填 不適用",
  "stopLoss": "停損價，沒有就填 不適用",
  "timeHorizon": "short | swing | long",
  "confidence": 0,
  "reason": "主要原因",
  "keyRisks": ["主要風險"],
  "conditionsToAct": ["可以行動前需要看到的條件"]
}`;

function normalizeAction(suggestion: MissionAnalysis["suggestion"]) {
  if (suggestion === "buy") return "small_buy";
  if (suggestion === "reject") return "avoid";
  return suggestion;
}

function buildQuickSingleStockPrompt(dataPackage: MissionDataPackage) {
  return `你是謹慎的投資分析師。請只分析這個單一股票任務，不要掃描其他股票，不要建立多股票清單。

任務問題：${dataPackage.mission.originalQuestion}
任務類型：${dataPackage.mission.missionType}
相關代號：${dataPackage.mission.relatedSymbols.join(", ") || "未提供"}

相關股票即時資料：
${JSON.stringify(dataPackage.mission.relatedSecurities, null, 2)}

使用者持股：
${JSON.stringify(dataPackage.portfolio, null, 2)}

市場摘要：
${JSON.stringify(dataPackage.marketSnapshot, null, 2)}

資料品質：
${JSON.stringify(dataPackage.dataQualitySummary, null, 2)}

請用繁體中文回答。輸出必須是有效 JSON，schema 如下：
${QUICK_SINGLE_STOCK_SCHEMA}

規則：
- 只回答這一檔股票，不要推薦其他股票。
- 如果資料不足、價格缺失或資料過舊，suggestion 必須是 wait 或 reject，confidence 不可超過 60。
- 如果建議買進，請偏保守，suggestion 使用 buy，但 reason 必須說明風險。
- 只回傳 JSON，不要加 markdown。`;
}

async function getQuickModel() {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("divisions")
    .select("name, manager_name, model_provider, model_name")
    .eq("is_enabled", true)
    .eq("model_provider", "OpenAI")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "找不到可用的快速分析模型。");
  }

  return data as {
    name: string;
    manager_name: string;
    model_provider: string;
    model_name: string;
  };
}

export async function runSingleStockMission(params: {
  userId: string;
  missionId: string;
  dataPackage: MissionDataPackage;
}) {
  const supabase = createSupabaseServiceClient();
  const familyId = await getFamilyId(params.userId);
  const model = await getQuickModel();
  const prompt = buildQuickSingleStockPrompt(params.dataPackage);
  const startedAt = new Date().toISOString();
  let tokenCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd = 0;

  try {
    const modelResult = await callModel({
      provider: model.model_provider,
      model: model.model_name,
      prompt
    });
    tokenCount += modelResult.tokenCount;
    promptTokens += modelResult.promptTokens;
    completionTokens += modelResult.completionTokens;
    estimatedCostUsd += modelResult.estimatedCostUsd;

    const validation = await validateOrRepair({
      rawText: modelResult.text,
      schema: MissionAnalysisSchema,
      schemaDescription: QUICK_SINGLE_STOCK_SCHEMA,
      provider: model.model_provider,
      model: model.model_name
    });
    tokenCount += validation.tokenCount;
    promptTokens += validation.promptTokens;
    completionTokens += validation.completionTokens;
    estimatedCostUsd += validation.estimatedCostUsd;

    const analysis = validation.parsed;
    const action = normalizeAction(analysis.suggestion);
    const symbol = analysis.relatedSymbols[0] ?? params.dataPackage.mission.relatedSymbols[0] ?? "";
    const relatedSecurity = params.dataPackage.mission.relatedSecurities.find(
      (security) => security.symbol === symbol
    );
    const market = relatedSecurity?.market ?? (/^\d+$/.test(symbol) ? "TW" : "US");
    const name = relatedSecurity?.name || symbol;
    const decision: DivisionDecision = {
      division: "快速單股分析",
      divisionManager: model.manager_name,
      marketSummary: analysis.summary,
      portfolioActions: [],
      missionDecision: analysis,
      topRecommendations: [
        {
          symbol,
          market,
          name,
          action,
          reason: analysis.reason,
          buyZone: analysis.buyZone,
          targetPrice: analysis.targetPrice,
          stopLoss: analysis.stopLoss,
          positionSize: action === "small_buy" ? "小部位" : "不適用",
          timeHorizon: analysis.timeHorizon,
          confidence: analysis.confidence,
          keyRisks: analysis.keyRisks
        }
      ],
      confidence: analysis.confidence,
      supportingReasons: [analysis.reason],
      opposingReasons: analysis.keyRisks,
      supportingTeams: ["快速單股分析"],
      opposingTeams: [],
      internalDisagreements: [],
      decisionAction: action
    };

    const { data, error } = await supabase
      .from("division_decisions")
      .insert({
        user_id: params.userId,
        family_id: familyId,
        daily_run_id: null,
        mission_id: params.missionId,
        division: decision.division,
        division_manager: decision.divisionManager,
        model_provider: model.model_provider,
        model_name: model.model_name,
        decision_action: decision.decisionAction,
        confidence: decision.confidence,
        market_summary: decision.marketSummary,
        portfolio_actions: decision.portfolioActions,
        mission_decision: decision.missionDecision,
        top_recommendations: decision.topRecommendations,
        supporting_teams: decision.supportingTeams,
        opposing_teams: decision.opposingTeams,
        internal_disagreements: decision.internalDisagreements
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "快速分析結果儲存失敗。");
    }

    await writeRecommendations({
      userId: params.userId,
      familyId,
      dailyRunId: null,
      missionId: params.missionId,
      teamReports: [],
      divisionDecisions: [
        {
          decision,
          divisionDecisionId: (data as { id: string }).id
        }
      ],
      committeeDecision: null
    });

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: null,
      missionId: params.missionId,
      provider: model.model_provider,
      model: model.model_name,
      promptKey: "missionAnalysis",
      inputSummary: inputSummary(prompt),
      output: analysis,
      confidence: analysis.confidence,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "completed"
    });

    return {
      decision,
      divisionDecisionId: (data as { id: string }).id
    };
  } catch (error) {
    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: null,
      missionId: params.missionId,
      provider: model.model_provider,
      model: model.model_name,
      promptKey: "missionAnalysis",
      inputSummary: inputSummary(prompt),
      output: {
        error: error instanceof Error ? error.message : "Unknown quick mission failure"
      },
      confidence: null,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown quick mission failure"
    });

    throw error;
  }
}
