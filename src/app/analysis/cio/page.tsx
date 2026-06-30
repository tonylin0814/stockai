import { RunAnalysisButton } from "@/components/run-analysis-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

type LatestRun = {
  id: string;
  run_date: string;
  status: string;
};

type TeamReportRow = {
  team_name: string | null;
  team_leader: string | null;
  division: string | null;
  final_team_view: unknown;
  confidence: number | null;
};

type DivisionDecisionRow = {
  division: string | null;
  division_manager: string | null;
  market_summary: string | null;
  decision_action: string | null;
  confidence: number | null;
  top_recommendations: unknown;
};

type CommitteeDecisionRow = {
  model_provider: string | null;
  final_action: string | null;
  action_type: string | null;
  consensus_level: string | null;
  confidence: number | null;
  weighted_confidence?: number | null;
  decision_summary: string | null;
  agreement_summary: string | null;
  disagreement_summary: string | null;
  final_recommendations: unknown;
  is_action_allowed: boolean | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as JsonRecord[]) : [];
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function percent(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : String(value);
}

function lines(value: string | null) {
  return (value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function committeeLabel(row: CommitteeDecisionRow) {
  return row.model_provider === "Anthropic" ? "Committee B · Claude" : "Committee A · GPT";
}

function groupedTeams(teamReports: TeamReportRow[]) {
  const groups = new Map<string, TeamReportRow[]>();
  for (const team of teamReports) {
    const division = team.division ?? "未分類";
    groups.set(division, [...(groups.get(division) ?? []), team]);
  }
  return Array.from(groups.entries());
}

function recommendationValue(rec: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (rec[key] !== null && rec[key] !== undefined && rec[key] !== "") return String(rec[key]);
  }
  return "—";
}

function buyZone(rec: JsonRecord) {
  const low = recommendationValue(rec, ["buyZoneLow", "buy_zone_low", "entryLow", "entry_low"]);
  const high = recommendationValue(rec, ["buyZoneHigh", "buy_zone_high", "entryHigh", "entry_high"]);
  if (low === "—" && high === "—") {
    return recommendationValue(rec, ["buyZone", "buy_zone", "entryPoint", "entry_point"]);
  }
  return `${low} – ${high}`;
}

export default async function CioDecisionPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: latestRun } = await supabase
    .from("daily_runs")
    .select("id, run_date, status")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRun) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">CIO 每日簡報</h1>
        <p className="mt-2 text-sm text-slate-600">分析尚未完成，請執行每日分析。</p>
        <div className="mt-4">
          <RunAnalysisButton label="執行每日分析" />
        </div>
      </div>
    );
  }

  const run = latestRun as LatestRun;
  const [teamReportsRes, divisionRes, committeeRes] = await Promise.all([
    supabase
      .from("team_reports")
      .select("team_name, team_leader, division, final_team_view, confidence, created_at")
      .eq("daily_run_id", run.id)
      .eq("user_id", user.id)
      .order("division")
      .order("created_at"),
    supabase
      .from("division_decisions")
      .select("division, division_manager, market_summary, decision_action, confidence, top_recommendations, created_at")
      .eq("daily_run_id", run.id)
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("committee_decisions")
      .select("model_provider, final_action, action_type, consensus_level, confidence, weighted_confidence, decision_summary, agreement_summary, disagreement_summary, final_recommendations, is_action_allowed, created_at")
      .eq("daily_run_id", run.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
  ]);

  const teamReports = (teamReportsRes.data ?? []) as TeamReportRow[];
  const divisions = (divisionRes.data ?? []) as DivisionDecisionRow[];
  const committees = (committeeRes.data ?? []) as CommitteeDecisionRow[];

  if (!teamReports.length || !committees.length) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">CIO 每日簡報</h1>
        <p className="mt-2 text-sm text-slate-600">分析尚未完成，請執行每日分析。</p>
        <div className="mt-4">
          <RunAnalysisButton label="執行每日分析" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">CIO 每日簡報</h1>
          <p className="mt-1 text-sm text-slate-500">
            {run.run_date} · {run.status}
          </p>
        </div>
        <RunAnalysisButton label="執行每日分析" />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">市場環境</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {divisions.map((division) => (
            <div key={`${division.division}-${division.division_manager}`} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs font-medium text-slate-500">
                {text(division.division_manager)} · {text(division.division)}
              </p>
              <p className="text-sm leading-6 text-slate-700">{text(division.market_summary)}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">AI 團隊總結</h2>
        {groupedTeams(teamReports).map(([divisionName, teams]) => (
          <div key={divisionName} className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{divisionName}</p>
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Team</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">今日最重要行動</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">信心</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teams.map((team) => {
                    const view = asRecord(team.final_team_view);
                    return (
                      <tr key={`${team.division}-${team.team_name}`}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                          {text(team.team_name)}
                          <span className="ml-2 text-xs text-slate-400">{text(team.team_leader)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {text(view.mostImportantAction ?? view.summary)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {percent(view.confidence ?? team.confidence)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">委員會決策對比</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {committees.map((committee, index) => {
            const actionAllowedColor = committee.is_action_allowed
              ? "bg-green-50 text-green-700"
              : "bg-slate-50 text-slate-600";
            const recs = asArray(committee.final_recommendations);
            const firstRec = recs[0] ?? {};
            const agreements = lines(committee.agreement_summary);
            const disagreements = lines(committee.disagreement_summary);

            return (
              <div key={`${committee.model_provider}-${index}`} className="space-y-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{committeeLabel(committee)}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${actionAllowedColor}`}>
                    {committee.is_action_allowed ? "允許行動" : "觀望"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">結論：</span><span className="font-medium text-slate-800">{text(committee.action_type ?? committee.final_action)}</span></div>
                  <div><span className="text-slate-500">共識：</span><span className="font-medium text-slate-800">{text(committee.consensus_level)}</span></div>
                  <div><span className="text-slate-500">信心：</span><span className="font-medium text-slate-800">{percent(committee.confidence)}</span></div>
                  <div><span className="text-slate-500">進場：</span><span className="font-medium text-slate-800">{buyZone(firstRec)}</span></div>
                  <div><span className="text-slate-500">目標：</span><span className="font-medium text-slate-800">{recommendationValue(firstRec, ["targetPrice", "target_price"])}</span></div>
                  <div><span className="text-slate-500">停損：</span><span className="font-medium text-slate-800">{recommendationValue(firstRec, ["stopLoss", "stop_loss"])}</span></div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">決策理由</p>
                  <p className="text-sm leading-6 text-slate-700">{text(committee.decision_summary)}</p>
                </div>

                {agreements.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-green-700">共識點</p>
                    <ul className="space-y-0.5 text-sm text-slate-700">
                      {agreements.map((item, itemIndex) => (
                        <li key={itemIndex}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {disagreements.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-red-700">分歧點</p>
                    <ul className="space-y-0.5 text-sm text-slate-700">
                      {disagreements.map((item, itemIndex) => (
                        <li key={itemIndex}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">具體建議清單</h2>
        {committees.map((committee, committeeIndex) => {
          const recs = asArray(committee.final_recommendations);
          if (!recs.length) return null;
          const label = committee.model_provider === "Anthropic" ? "Committee B" : "Committee A";
          return (
            <div key={`${label}-${committeeIndex}`} className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">標的</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">操作</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">進場區間</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">目標</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">停損</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">倉位</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">信心</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recs.map((rec, recIndex) => (
                      <tr key={recIndex}>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {recommendationValue(rec, ["ticker", "symbol", "security"])}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{recommendationValue(rec, ["action"])}</td>
                        <td className="px-4 py-3 text-slate-700">{buyZone(rec)}</td>
                        <td className="px-4 py-3 text-slate-700">{recommendationValue(rec, ["targetPrice", "target_price"])}</td>
                        <td className="px-4 py-3 text-slate-700">{recommendationValue(rec, ["stopLoss", "stop_loss"])}</td>
                        <td className="px-4 py-3 text-slate-700">{recommendationValue(rec, ["positionSizePct", "position_size_pct"])}</td>
                        <td className="px-4 py-3 text-slate-700">{percent(rec.confidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-md border-2 border-slate-300 bg-slate-50 p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">CIO 決策</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {committees.map((committee, index) => {
            const label =
              committee.model_provider === "Anthropic"
                ? "採用 Committee B（Claude 視角）"
                : "採用 Committee A（GPT 視角）";
            return (
              <div key={`${committee.model_provider}-${index}`} className="flex items-start gap-3 rounded-md border border-slate-300 bg-white p-4">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                <div>
                  <p className="font-medium text-slate-800">{label}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {text(committee.action_type)} · 信心 {percent(committee.confidence)} · {committee.is_action_allowed ? "允許行動" : "建議觀望"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-400">勾選僅作本地閱讀紀錄，不影響系統資料。</p>
      </section>
    </div>
  );
}
