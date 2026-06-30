import { ReportActions } from "@/components/report-actions";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { loadCompletedReportForUser, type ReportCommitteeRow, type ReportTeamRow } from "@/lib/report/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
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

function committeeLabel(row: ReportCommitteeRow) {
  return row.model_provider === "Anthropic" ? "Committee B · Claude" : "Committee A · GPT";
}

function groupedTeams(teamReports: ReportTeamRow[]) {
  const groups = new Map<string, ReportTeamRow[]>();
  for (const team of teamReports) {
    groups.set(team.division, [...(groups.get(team.division) ?? []), team]);
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
  const direct = recommendationValue(rec, ["buyZone", "buy_zone", "entryPoint", "entry_point"]);
  if (direct !== "—") return direct;
  const low = recommendationValue(rec, ["buyZoneLow", "buy_zone_low", "entryLow", "entry_low"]);
  const high = recommendationValue(rec, ["buyZoneHigh", "buy_zone_high", "entryHigh", "entry_high"]);
  if (low === "—" && high === "—") return "—";
  return `${low} – ${high}`;
}

export default async function AnalysisReportPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const loaded = await loadCompletedReportForUser(supabase, user.id);

  if (!loaded || !loaded.reportData.teamReports.length || !loaded.reportData.committees.length) {
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

  const { latestRun, reportData } = loaded;
  const { teamReports, divisions, committees } = reportData;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">CIO 每日簡報</h1>
          <p className="mt-1 text-sm text-slate-500">
            {latestRun.run_date} · {latestRun.status}
          </p>
        </div>
        <ReportActions runId={latestRun.id} runDate={String(latestRun.run_date)} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">市場環境</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {divisions.map((division) => (
            <div key={`${division.division}-${division.division_manager}`} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs font-medium text-slate-500">
                {division.division_manager} · {division.division}
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
                          {team.team_name}
                          <span className="ml-2 text-xs text-slate-400">{team.team_leader}</span>
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
            const recs = committee.final_recommendations ?? [];
            const firstRec = recs[0] ?? {};

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
                  <p className="text-sm leading-6 text-slate-700">{text(committee.reason)}</p>
                </div>

                {committee.agreements?.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-green-700">共識點</p>
                    <ul className="space-y-0.5 text-sm text-slate-700">
                      {committee.agreements.map((item, itemIndex) => (
                        <li key={itemIndex}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {committee.disagreements?.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-red-700">分歧點</p>
                    <ul className="space-y-0.5 text-sm text-slate-700">
                      {committee.disagreements.map((item, itemIndex) => (
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
          const recs = committee.final_recommendations ?? [];
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
                        <td className="px-4 py-3 font-medium text-slate-800">{recommendationValue(rec, ["ticker", "symbol", "security"])}</td>
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
