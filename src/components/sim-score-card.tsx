import { cn } from "@/lib/utils";

type SimScore = {
  alpha_score: number;
  win_rate_score: number;
  risk_control_score: number;
  conviction_score: number;
  prediction_score: number;
  total_score: number;
  badges: unknown;
  cumulative_total: number | null;
};

export function SimScoreCard({ score }: { score: SimScore | null }) {
  if (!score) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-950">績效評分</h3>
        <p className="mt-2 text-sm text-slate-500">尚無評分資料。執行每週評估後產生。</p>
      </div>
    );
  }

  const dimensions = [
    { label: "Alpha", score: Number(score.alpha_score), max: 30, color: "bg-blue-500" },
    { label: "勝率", score: Number(score.win_rate_score), max: 20, color: "bg-green-500" },
    { label: "風險控制", score: Number(score.risk_control_score), max: 20, color: "bg-amber-500" },
    { label: "信心校準", score: Number(score.conviction_score), max: 15, color: "bg-violet-500" },
    { label: "預測準確", score: Number(score.prediction_score), max: 15, color: "bg-rose-500" }
  ];
  const badges = Array.isArray(score.badges) ? (score.badges as string[]) : [];

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-950">本週績效評分</h3>
        <div className="text-2xl font-bold text-slate-950">
          {Number(score.total_score).toFixed(0)}
          <span className="text-sm font-normal text-slate-400"> / 100</span>
        </div>
      </div>

      <div className="space-y-2">
        {dimensions.map((dim) => (
          <div key={dim.label}>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{dim.label}</span>
              <span className="font-medium">
                {dim.score.toFixed(0)} / {dim.max}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div
                className={cn("h-1.5 rounded-full", dim.color)}
                style={{ width: `${Math.max(0, Math.min(100, (dim.score / dim.max) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {badges.length ? (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {badges.map((badge) => (
            <span key={badge} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {badge}
            </span>
          ))}
        </div>
      ) : null}

      {score.cumulative_total !== null ? (
        <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
          累積平均分數：{Number(score.cumulative_total).toFixed(1)} / 100
        </p>
      ) : null}
    </div>
  );
}
