import { RunAnalysisButton } from "@/components/run-analysis-button";
import { Table, Td, Th } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-50">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export default async function CioDecisionPage() {
  const supabase = createSupabaseServerClient();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  if (!user) return null;

  let decision: Record<string, unknown> | null = null;

  try {
    const result = await supabase
      .from("committee_decisions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    decision = (result.data as Record<string, unknown> | null) ?? null;
  } catch {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-semibold text-red-900">CIO 決策讀取失敗</h1>
        <p className="mt-2 text-sm text-red-700">請稍後重新整理頁面。</p>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">CIO 決策</h1>
        <p className="mt-2 text-sm text-slate-600">尚未有委員會決策。請先執行每日分析。</p>
        <div className="mt-4">
          <RunAnalysisButton />
        </div>
      </div>
    );
  }

  const row = decision as Record<string, unknown>;
  const divisionInputs = (row.division_inputs ?? []) as Array<Record<string, unknown>>;
  const finalRecommendations = (row.final_recommendations ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">CIO 決策</h1>
        <p className="mt-1 text-sm text-slate-600">最近一次 Cross-Division Investment Committee 輸出。</p>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">最終決策</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <p>Final action：{String(row.final_action ?? "—")}</p>
          <p>Action type：{String(row.action_type ?? "—")}</p>
          <p>Consensus level：{String(row.consensus_level ?? "—")}</p>
          <p>Confidence：{String(row.confidence ?? "—")}</p>
          <p>Weighted confidence：{String(row.weighted_confidence ?? "—")}</p>
          <p>允許行動：{row.is_action_allowed ? "是" : "否"}</p>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <p>決策摘要：{String(row.decision_summary ?? "—")}</p>
          <p>同意點：{String(row.agreement_summary ?? "—")}</p>
          <p>分歧點：{String(row.disagreement_summary ?? "—")}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Division Inputs</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {divisionInputs.map((input, index) => (
            <div key={index} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-semibold text-slate-950">
                {String(input.division ?? `Division ${index + 1}`)}
              </h3>
              <JsonBlock value={input} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Final Recommendations</h2>
        <Table>
          <thead>
            <tr>
              <Th>代號</Th>
              <Th>市場</Th>
              <Th>行動</Th>
              <Th>信心</Th>
              <Th>理由</Th>
            </tr>
          </thead>
          <tbody>
            {finalRecommendations.length ? (
              finalRecommendations.map((item, index) => (
                <tr key={index}>
                  <Td>{String(item.symbol ?? "—")}</Td>
                  <Td>{String(item.market ?? "—")}</Td>
                  <Td>{String(item.action ?? row.action_type ?? "—")}</Td>
                  <Td>{String(item.confidence ?? row.confidence ?? "—")}</Td>
                  <Td>{String(item.reason ?? "—")}</Td>
                </tr>
              ))
            ) : (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-slate-500">
                  無最終建議。
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">原始委員會資料</h2>
        <JsonBlock value={row} />
      </section>
    </div>
  );
}
