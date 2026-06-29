"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type TeamReportRow = {
  id: string;
  division: string;
  team_name: string;
  market_view: Record<string, unknown> | null;
  portfolio_review: Array<Record<string, unknown>> | null;
  final_team_view: Record<string, unknown> | null;
};

export function TeamReportTabs({ reports }: { reports: TeamReportRow[] }) {
  const divisions = Array.from(new Set(reports.map((report) => report.division)));
  const [activeDivision, setActiveDivision] = useState(divisions[0] ?? "");
  const divisionReports = reports.filter((report) => report.division === activeDivision);
  const [activeTeamByDivision, setActiveTeamByDivision] = useState<Record<string, string>>({});
  const activeTeam =
    activeTeamByDivision[activeDivision] ?? divisionReports[0]?.team_name ?? "";
  const activeReport =
    divisionReports.find((report) => report.team_name === activeTeam) ?? divisionReports[0];

  if (!reports.length) {
    return <p className="text-sm text-slate-500">尚無 team report。</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {divisions.map((division) => (
          <Button
            key={division}
            type="button"
            variant={division === activeDivision ? "primary" : "secondary"}
            size="sm"
            onClick={() => setActiveDivision(division)}
          >
            {division}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {divisionReports.map((report) => (
          <Button
            key={report.id}
            type="button"
            variant={report.team_name === activeTeam ? "primary" : "secondary"}
            size="sm"
            onClick={() =>
              setActiveTeamByDivision((current) => ({
                ...current,
                [activeDivision]: report.team_name
              }))
            }
          >
            {report.team_name}
          </Button>
        ))}
      </div>
      {activeReport ? (
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">{activeReport.team_name}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section>
              <h4 className="font-medium text-slate-800">市場觀點</h4>
              <p className="mt-1 text-sm text-slate-600">
                {String(activeReport.market_view?.summary ?? "—")}
              </p>
            </section>
            <section>
              <h4 className="font-medium text-slate-800">團隊總結</h4>
              <p className="mt-1 text-sm text-slate-600">
                {String(activeReport.final_team_view?.summary ?? "—")}
              </p>
            </section>
          </div>
          <details className="mt-4 rounded-md border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">
              投資組合檢視
            </summary>
            <div className="mt-3 space-y-3">
              {(activeReport.portfolio_review ?? []).map((item, index) => (
                <div key={index} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="font-medium">
                    {String(item.symbol ?? "")} {String(item.name ?? "")}
                  </div>
                  <div>建議：{String(item.action ?? "—")}</div>
                  <div>理由：{String(item.reason ?? "—")}</div>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
