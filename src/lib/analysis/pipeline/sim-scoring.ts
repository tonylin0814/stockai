export type SimTradeForScore = {
  action: string;
  outcome_pnl: number | null;
  outcome_pct: number | null;
  conviction: number | null;
};

export type SimPredictionForScore = {
  condition_met: boolean | null;
  action_taken: boolean | null;
  verified_at: string | null;
};

export type ScoreBreakdown = {
  alpha: { score: number; max: 30; detail: string };
  winRate: { score: number; max: 20; detail: string };
  riskControl: { score: number; max: 20; detail: string };
  convictionCalibration: { score: number; max: 15; detail: string };
  predictionAccuracy: { score: number; max: 15; detail: string };
  total: number;
  badges: string[];
  metrics: {
    usAlpha: number;
    twAlpha: number;
    winRatePct: number | null;
    tradesEvaluated: number;
    winningTrades: number;
    losingTrades: number;
    maxDrawdownPct: number;
    peakValue: number | null;
    troughValue: number | null;
    avgConvictionWinners: number | null;
    avgConvictionLosers: number | null;
    predictionsMade: number;
    predictionsCorrect: number;
    predictionAccuracyPct: number | null;
  };
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export async function computeWeeklyScore(params: {
  usReturnPct: number;
  twReturnPct: number;
  usBenchmarkPct: number;
  twBenchmarkPct: number;
  closedTrades: SimTradeForScore[];
  weeklySnapshots: { date: string; value: number }[];
  predictions: SimPredictionForScore[];
}): Promise<ScoreBreakdown> {
  const usAlpha = params.usReturnPct - params.usBenchmarkPct;
  const twAlpha = params.twReturnPct - params.twBenchmarkPct;
  const avgAlpha = (usAlpha + twAlpha) / 2;

  let alphaScore = 0;
  let alphaDetail = `大幅落後大盤 ${avgAlpha.toFixed(2)}%`;
  if (avgAlpha > 5) {
    alphaScore = 30;
    alphaDetail = `大幅超越大盤 +${avgAlpha.toFixed(2)}%`;
  } else if (avgAlpha > 3) {
    alphaScore = 25;
    alphaDetail = `超越大盤 +${avgAlpha.toFixed(2)}%`;
  } else if (avgAlpha > 1) {
    alphaScore = 18;
    alphaDetail = `小幅超越大盤 +${avgAlpha.toFixed(2)}%`;
  } else if (avgAlpha > -1) {
    alphaScore = 10;
    alphaDetail = `與大盤接近 ${avgAlpha.toFixed(2)}%`;
  } else if (avgAlpha > -3) {
    alphaScore = 5;
    alphaDetail = `小幅落後大盤 ${avgAlpha.toFixed(2)}%`;
  }

  const closedTrades = params.closedTrades.filter(
    (trade) => trade.action === "sell" && trade.outcome_pnl !== null
  );
  const winningTrades = closedTrades.filter((trade) => Number(trade.outcome_pnl) > 0);
  const losingTrades = closedTrades.length - winningTrades.length;
  const winRate = closedTrades.length ? winningTrades.length / closedTrades.length : null;
  let winRateScore = 10;
  let winRateDetail = "本週無已結算交易";
  if (winRate !== null) {
    if (winRate >= 0.7) winRateScore = 20;
    else if (winRate >= 0.6) winRateScore = 15;
    else if (winRate >= 0.5) winRateScore = 10;
    else winRateScore = 5;
    winRateDetail = `勝率 ${(winRate * 100).toFixed(0)}%`;
  }

  let peak = -Infinity;
  let trough = Infinity;
  let maxDrawdown = 0;
  for (const snapshot of params.weeklySnapshots) {
    if (!Number.isFinite(snapshot.value) || snapshot.value <= 0) continue;
    if (snapshot.value > peak) peak = snapshot.value;
    const drawdown = peak > 0 ? (peak - snapshot.value) / peak : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      trough = snapshot.value;
    }
  }
  if (!Number.isFinite(peak)) peak = 0;
  if (!Number.isFinite(trough)) trough = peak;

  let riskScore = 0;
  if (maxDrawdown < 0.03) riskScore = 20;
  else if (maxDrawdown < 0.05) riskScore = 17;
  else if (maxDrawdown < 0.1) riskScore = 12;
  else if (maxDrawdown < 0.15) riskScore = 6;
  const riskDetail = `最大回撤 ${(maxDrawdown * 100).toFixed(1)}%`;

  const tradesWithConviction = closedTrades.filter(
    (trade) => trade.conviction !== null && trade.outcome_pct !== null
  );
  const highConv = tradesWithConviction.filter((trade) => Number(trade.conviction) >= 70);
  const lowConv = tradesWithConviction.filter((trade) => Number(trade.conviction) < 70);
  const avgHighConv = average(highConv.map((trade) => Number(trade.outcome_pct)));
  const avgLowConv = average(lowConv.map((trade) => Number(trade.outcome_pct)));
  let convictionScore = 8;
  let convictionDetail = "資料不足，給予中性分數";
  if (tradesWithConviction.length >= 3 && avgHighConv !== null && avgLowConv !== null) {
    if (avgHighConv > avgLowConv + 0.02) {
      convictionScore = 15;
      convictionDetail = "高信心交易明顯優於低信心交易";
    } else if (avgHighConv > avgLowConv) {
      convictionScore = 10;
      convictionDetail = "高信心交易略優於低信心交易";
    } else {
      convictionScore = 5;
      convictionDetail = "高低信心交易表現相近或逆轉";
    }
  }

  const verifiedPredictions = params.predictions.filter(
    (prediction) => prediction.verified_at !== null && prediction.condition_met !== null
  );
  const metPredictions = verifiedPredictions.filter((prediction) => prediction.condition_met);
  const correctPredictions = verifiedPredictions.filter(
    (prediction) => prediction.condition_met && prediction.action_taken
  );
  const predictionAccuracy = metPredictions.length
    ? correctPredictions.length / metPredictions.length
    : null;
  let predictionScore = 8;
  let predictionDetail = "本週無可驗證預測";
  if (predictionAccuracy !== null) {
    if (predictionAccuracy >= 0.8) predictionScore = 15;
    else if (predictionAccuracy >= 0.6) predictionScore = 11;
    else if (predictionAccuracy >= 0.4) predictionScore = 7;
    else predictionScore = 3;
    predictionDetail = `${correctPredictions.length}/${metPredictions.length} 條件達成預測有跟進`;
  }

  const total = alphaScore + winRateScore + riskScore + convictionScore + predictionScore;
  const badges: string[] = [];
  if (avgAlpha > 5) badges.push("大盤終結者");
  if (winRate !== null && winRate >= 0.7) badges.push("高勝率");
  if (maxDrawdown < 0.03) badges.push("穩健風控");
  if (convictionScore >= 13) badges.push("信心校準大師");
  if (predictionScore >= 13) badges.push("精準預測");
  if (total >= 85) badges.push("本週冠軍");
  if (total >= 95) badges.push("完美週");

  return {
    alpha: { score: alphaScore, max: 30, detail: alphaDetail },
    winRate: { score: winRateScore, max: 20, detail: winRateDetail },
    riskControl: { score: riskScore, max: 20, detail: riskDetail },
    convictionCalibration: { score: convictionScore, max: 15, detail: convictionDetail },
    predictionAccuracy: { score: predictionScore, max: 15, detail: predictionDetail },
    total,
    badges,
    metrics: {
      usAlpha,
      twAlpha,
      winRatePct: winRate === null ? null : winRate * 100,
      tradesEvaluated: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades,
      maxDrawdownPct: maxDrawdown * 100,
      peakValue: peak || null,
      troughValue: trough || null,
      avgConvictionWinners: avgHighConv,
      avgConvictionLosers: avgLowConv,
      predictionsMade: verifiedPredictions.length,
      predictionsCorrect: correctPredictions.length,
      predictionAccuracyPct: predictionAccuracy === null ? null : predictionAccuracy * 100
    }
  };
}
