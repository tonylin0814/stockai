import { getFamilyId, savePipelineAgentRun } from "@/lib/analysis/pipeline/db";
import { callModel, inputSummary, validateOrRepair } from "@/lib/analysis/pipeline/model";
import { writeRecommendations } from "@/lib/analysis/pipeline/recommendations";
import {
  CommitteeDecisionSchema,
  MissionAnalysisSchema,
  type CommitteeDecision,
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
  "technicalHighlights": [
    "技術面重點，必須包含具體數字",
    "若技術資料不足，請說明缺少哪些資料"
  ],
  "keyRisks": ["主要風險"],
  "conditionsToAct": ["可以行動前需要看到的條件"]
}`;

type QuickModel = {
  name: string;
  manager_name: string;
  model_provider: string;
  model_name: string;
};

type QuickAnalysisResult =
  | {
      status: "completed";
      model: QuickModel;
      analysis: MissionAnalysis;
      decision: DivisionDecision;
    }
  | {
      status: "failed";
      model: QuickModel;
      error: string;
    };

function normalizeAction(suggestion: MissionAnalysis["suggestion"]) {
  if (suggestion === "buy") return "small_buy";
  if (suggestion === "reject") return "avoid";
  return suggestion;
}

function getAnalysisModel(provider: string, configuredModel: string): string {
  return process.env.CODEX_MODEL_NAME ?? "codex-local";
}

function actionRank(action: DivisionDecision["decisionAction"]) {
  const ranks: Record<DivisionDecision["decisionAction"], number> = {
    avoid: 0,
    sell: 1,
    reduce: 2,
    wait: 3,
    hold: 4,
    small_buy: 5,
    buy: 6
  };

  return ranks[action] ?? 3;
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

## technicalHighlights 欄位寫作規則

technicalHighlights 是技術面專屬摘要，每條 1 句話，必須包含具體數字。必填 2-5 條，涵蓋：
- MA位置：現價相對 SMA20/SMA50/SMA200 的位置與百分比距離；若 SMA200 有資料，必須提及年線。
- K線形態：若 candlePattern 不為 null，寫出形態名稱與含義。
- 支撐/壓力：若有資料，寫出具體價位、強弱與用途。
- 量能：若 volumeSignal 不為 normal/null，寫出量能訊號與含義。
- RSI / MACD：若有資料，寫出數值與判斷。

若某項技術資料為 null 或缺失，跳過該條，不得編造數字。

規則：
- 只回答這一檔股票，不要推薦其他股票。
- 你必須給出明確建議：buy、wait、reject、hold、reduce 或 sell。
- reason 必須包含至少三個具體理由，並明確提到價格、漲跌幅、風險。
- 如果資料不足、價格缺失或資料過舊，suggestion 必須是 wait 或 reject，confidence 不可超過 60。
- 如果建議買進，請偏保守，suggestion 使用 buy，但 reason 必須說明風險。
- 只回傳 JSON，不要加 markdown。`;
}

async function getQuickModels() {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stocks_divisions")
    .select("name, manager_name, model_provider, model_name")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as QuickModel[];
  const models = rows.slice(0, 2).map((row) => ({ ...row, model_provider: "Codex" }));

  if (!models.length) {
    throw new Error("找不到可用的快速分析模型。");
  }

  return models.map((model) => ({
    ...model,
    model_name: getAnalysisModel(model.model_provider, model.model_name)
  }));
}

function buildDecision(params: {
  model: QuickModel;
  analysis: MissionAnalysis;
  dataPackage: MissionDataPackage;
}): DivisionDecision {
  const action = normalizeAction(params.analysis.suggestion);
  const symbol =
    params.analysis.relatedSymbols[0] ?? params.dataPackage.mission.relatedSymbols[0] ?? "";
  const relatedSecurity = params.dataPackage.mission.relatedSecurities.find(
    (security) => security.symbol === symbol
  );
  const market = relatedSecurity?.market ?? (/^\d+$/.test(symbol) ? "TW" : "US");
  const name = relatedSecurity?.name || symbol;

  return {
    division: `${params.model.model_provider} 快速分析`,
    divisionManager: params.model.manager_name,
    marketSummary: params.analysis.summary,
    portfolioActions: [],
    missionDecision: params.analysis,
    topRecommendations: [
      {
        symbol,
        market,
        name,
        action,
        reason: params.analysis.reason,
        buyZone: params.analysis.buyZone,
        targetPrice: params.analysis.targetPrice,
        stopLoss: params.analysis.stopLoss,
        positionSize: action === "small_buy" ? "小部位" : "不適用",
        timeHorizon: params.analysis.timeHorizon,
        confidence: params.analysis.confidence,
        keyRisks: params.analysis.keyRisks,
        technicalHighlights: params.analysis.technicalHighlights
      }
    ],
    confidence: params.analysis.confidence,
    supportingReasons: [params.analysis.reason],
    opposingReasons: params.analysis.keyRisks,
    supportingTeams: [`${params.model.model_provider} 快速分析`],
    opposingTeams: [],
    internalDisagreements: [],
    decisionAction: action
  };
}

async function runQuickModel(params: {
  userId: string;
  missionId: string;
  dataPackage: MissionDataPackage;
  model: QuickModel;
}): Promise<QuickAnalysisResult> {
  const prompt = buildQuickSingleStockPrompt(params.dataPackage);
  const startedAt = new Date().toISOString();
  let tokenCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd = 0;

  try {
    const modelResult = await callModel({
      provider: params.model.model_provider,
      model: params.model.model_name,
      prompt,
      budget: {
        userId: params.userId,
        missionId: params.missionId
      }
    });
    tokenCount += modelResult.tokenCount;
    promptTokens += modelResult.promptTokens;
    completionTokens += modelResult.completionTokens;
    estimatedCostUsd += modelResult.estimatedCostUsd;

    const validation = await validateOrRepair({
      rawText: modelResult.text,
      schema: MissionAnalysisSchema,
      schemaDescription: QUICK_SINGLE_STOCK_SCHEMA,
      provider: params.model.model_provider,
      model: params.model.model_name,
      budget: {
        userId: params.userId,
        missionId: params.missionId
      }
    });
    tokenCount += validation.tokenCount;
    promptTokens += validation.promptTokens;
    completionTokens += validation.completionTokens;
    estimatedCostUsd += validation.estimatedCostUsd;

    const analysis = validation.parsed;
    const decision = buildDecision({
      model: params.model,
      analysis,
      dataPackage: params.dataPackage
    });

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: null,
      missionId: params.missionId,
      provider: params.model.model_provider,
      model: params.model.model_name,
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
      status: "completed",
      model: params.model,
      analysis,
      decision
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown quick mission failure";

    await savePipelineAgentRun({
      userId: params.userId,
      dailyRunId: null,
      missionId: params.missionId,
      provider: params.model.model_provider,
      model: params.model.model_name,
      promptKey: "missionAnalysis",
      inputSummary: inputSummary(prompt),
      output: { error: message },
      confidence: null,
      tokenCount,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: message
    });

    return {
      status: "failed",
      model: params.model,
      error: message
    };
  }
}

function buildConsensus(results: Array<Extract<QuickAnalysisResult, { status: "completed" }>>) {
  const actions = results.map((result) => result.decision.decisionAction);
  const mostConservative = results.reduce((lowest, current) =>
    actionRank(current.decision.decisionAction) < actionRank(lowest.decision.decisionAction)
      ? current
      : lowest
  );
  const mostAggressive = results.reduce((highest, current) =>
    actionRank(current.decision.decisionAction) > actionRank(highest.decision.decisionAction)
      ? current
      : highest
  );
  const allAgree = actions.every((action) => action === actions[0]);
  const averageConfidence =
    results.reduce((sum, result) => sum + result.decision.confidence, 0) / results.length;
  const actionType = mostConservative.decision.decisionAction;
  const consensusLevel: CommitteeDecision["consensusLevel"] = allAgree
    ? "strong"
    : results.length >= 2
      ? "weak"
      : "none";
  const isActionAllowed =
    consensusLevel === "strong" && (actionType === "small_buy" || actionType === "buy");
  const conservativeAnalysis = mostConservative.decision.missionDecision as MissionAnalysis;
  const actionLabel = isActionAllowed
    ? actionType === "buy"
      ? "買進"
      : "小部位介入"
    : actionType === "sell"
      ? "賣出"
      : actionType === "reduce"
        ? "減碼"
        : "觀望";
  const cleanReason = `委員會決定${actionLabel}，採用較保守的風險控管結論。${conservativeAnalysis.reason} 目前信心分數為 ${Math.round(
    Math.min(averageConfidence, mostConservative.decision.confidence)
  )}，若資料品質改善、價格進入合理區間，或技術訊號轉強，將重新評估行動時機。`;

  return CommitteeDecisionSchema.parse({
    finalAction: isActionAllowed ? "act" : "no_action",
    actionType,
    consensusLevel,
    divisionConclusions: Object.fromEntries(
      results.map((result) => [
        result.decision.division,
        {
          action: result.decision.decisionAction,
          confidence: result.decision.confidence,
          summary: result.decision.marketSummary,
          reason: (result.decision.missionDecision as MissionAnalysis).reason
        }
      ])
    ),
    agreements: allAgree ? [`兩個模型都建議 ${actionType}`] : [],
    disagreements: allAgree
      ? []
      : results.map(
          (result) =>
            `${result.decision.division}: ${result.decision.decisionAction} (${result.decision.confidence})`
        ),
    finalBuyZone: conservativeAnalysis.buyZone,
    finalTargetPrice: conservativeAnalysis.targetPrice,
    finalStopLoss: conservativeAnalysis.stopLoss,
    finalScenarios: conservativeAnalysis.scenarios,
    finalPositionSize: isActionAllowed ? "小部位" : "不適用",
    finalRecommendations: mostConservative.decision.topRecommendations,
    confidence: Math.round(Math.min(averageConfidence, mostConservative.decision.confidence)),
    isActionAllowed,
    reason: cleanReason,
    mostConservativeDivision: mostConservative.decision.division,
    mostAggressiveDivision: mostAggressive.decision.division,
    whatCouldChangeDecision: Array.from(
      new Set(
        results.flatMap(
          (result) => (result.decision.missionDecision as MissionAnalysis).conditionsToAct
        )
      )
    )
  });
}

function isFinalScenariosColumnMissing(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("final_scenarios"));
}

export async function runSingleStockMission(params: {
  userId: string;
  missionId: string;
  dataPackage: MissionDataPackage;
}) {
  const supabase = createSupabaseServiceClient();
  const familyId = await getFamilyId(params.userId);
  const models = await getQuickModels();
  const results: QuickAnalysisResult[] = [];
  for (const model of models) {
    results.push(
      await runQuickModel({
        userId: params.userId,
        missionId: params.missionId,
        dataPackage: params.dataPackage,
        model
      })
    );
  }
  const completed = results.filter(
    (result): result is Extract<QuickAnalysisResult, { status: "completed" }> =>
      result.status === "completed"
  );

  if (!completed.length) {
    const errors = results
      .filter((result): result is Extract<QuickAnalysisResult, { status: "failed" }> =>
        result.status === "failed"
      )
      .map((result) => result.error);
    throw new Error(errors.join("\n") || "快速分析失敗。");
  }

  const savedDivisionDecisions = [];

  for (const result of completed) {
    const { data, error } = await supabase
      .from("stocks_division_decisions")
      .insert({
        user_id: params.userId,
        family_id: familyId,
        daily_run_id: null,
        mission_id: params.missionId,
        division: result.decision.division,
        division_manager: result.decision.divisionManager,
        model_provider: result.model.model_provider,
        model_name: result.model.model_name,
        decision_action: result.decision.decisionAction,
        confidence: result.decision.confidence,
        market_summary: result.decision.marketSummary,
        portfolio_actions: result.decision.portfolioActions,
        mission_decision: result.decision.missionDecision,
        top_recommendations: result.decision.topRecommendations,
        supporting_teams: result.decision.supportingTeams,
        opposing_teams: result.decision.opposingTeams,
        internal_disagreements: result.decision.internalDisagreements
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "快速分析結果儲存失敗。");
    }

    savedDivisionDecisions.push({
      decision: result.decision,
      divisionDecisionId: (data as { id: string }).id
    });
  }

  const consensus = buildConsensus(completed);
  const committeePayload: Record<string, unknown> = {
    user_id: params.userId,
    family_id: familyId,
    daily_run_id: null,
    mission_id: params.missionId,
    final_action: consensus.finalAction,
    action_type: consensus.actionType,
    consensus_level: consensus.consensusLevel,
    confidence: consensus.confidence,
    weighted_confidence: consensus.confidence,
    decision_summary: consensus.reason,
    agreement_summary: consensus.agreements.join("\n"),
    disagreement_summary: consensus.disagreements.join("\n"),
    final_scenarios: consensus.finalScenarios ?? null,
    final_recommendations: consensus.finalRecommendations,
    division_inputs: savedDivisionDecisions.map((result) => result.decision),
    is_action_allowed: consensus.isActionAllowed
  };
  let { data: committeeData, error: committeeError } = await supabase
    .from("stocks_committee_decisions")
    .insert(committeePayload)
    .select("id")
    .single();

  if (isFinalScenariosColumnMissing(committeeError)) {
    delete committeePayload.final_scenarios;
    ({ data: committeeData, error: committeeError } = await supabase
      .from("stocks_committee_decisions")
      .insert(committeePayload)
      .select("id")
      .single());
  }

  if (committeeError || !committeeData) {
    throw new Error(committeeError?.message ?? "快速委員會結果儲存失敗。");
  }

  await writeRecommendations({
    userId: params.userId,
    familyId,
    dailyRunId: null,
    missionId: params.missionId,
    teamReports: [],
    divisionDecisions: savedDivisionDecisions,
    committeeDecision: {
      decision: consensus,
      committeeDecisionId: (committeeData as { id: string }).id
    }
  });

  return {
    decision: consensus,
    divisionDecisionId: savedDivisionDecisions[0]?.divisionDecisionId ?? null
  };
}
