# Codex Prompt 38 — CIO 報告頁面重建

## Background

`/analysis/cio` 目前只是 raw JSON dump，無法快速閱讀。目標是重建成一個完整的 CIO 每日簡報頁，讓使用者在 5 分鐘內看完所有分析並做出決策。

---

## 資料來源（全部從 Supabase 查詢）

查詢最近一筆 `daily_runs`（status = 'completed'），然後用 `daily_run_id` 關聯：

| 資料 | 表格 | 欄位 |
|------|------|------|
| 10 個 team 結論 | `team_reports` | `team_name`, `team_leader`, `division`, `final_team_view`, `confidence` |
| 2 個 division 決策 | `division_decisions` | `division`, `division_manager`, `market_summary`, `decision_action`, `confidence`, `top_recommendations` |
| 2 個 committee 報告 | `committee_decisions` | `model_provider`, `final_action`, `action_type`, `consensus_level`, `confidence`, `reason`, `agreements`, `disagreements`, `final_recommendations`, `is_action_allowed`, `what_could_change_decision`, `final_buy_zone`, `final_target_price`, `final_stop_loss`, `final_position_size` |

---

## 頁面結構：`src/app/analysis/cio/page.tsx`

完全重寫這個頁面（保持 Server Component）。

### 資料查詢

```ts
const supabase = createSupabaseServerClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return null;

// 最近一筆 completed run
const { data: latestRun } = await supabase
  .from("daily_runs")
  .select("id, run_date, status")
  .eq("user_id", user.id)
  .eq("status", "completed")
  .order("run_date", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!latestRun) {
  // 顯示空狀態 + RunAnalysisButton
}

const dailyRunId = latestRun.id;

// 平行查詢
const [teamReportsRes, divisionRes, committeeRes] = await Promise.all([
  supabase
    .from("team_reports")
    .select("team_name, team_leader, division, final_team_view, confidence")
    .eq("daily_run_id", dailyRunId)
    .eq("user_id", user.id)
    .order("division")
    .order("created_at"),
  supabase
    .from("division_decisions")
    .select("division, division_manager, market_summary, decision_action, confidence, top_recommendations")
    .eq("daily_run_id", dailyRunId)
    .eq("user_id", user.id)
    .order("created_at"),
  supabase
    .from("committee_decisions")
    .select("model_provider, final_action, action_type, consensus_level, confidence, reason, agreements, disagreements, final_recommendations, is_action_allowed, what_could_change_decision, final_buy_zone, final_target_price, final_stop_loss, final_position_size")
    .eq("daily_run_id", dailyRunId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
]);

const teamReports = teamReportsRes.data ?? [];
const divisions = divisionRes.data ?? [];
const committees = committeeRes.data ?? []; // [0] = Committee A (GPT), [1] = Committee B (Claude)
```

---

## 版面結構

### Section 1 — 頁首

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-semibold text-slate-950">CIO 每日簡報</h1>
    <p className="mt-1 text-sm text-slate-500">{latestRun.run_date} · {latestRun.status}</p>
  </div>
  <RunAnalysisButton />
</div>
```

---

### Section 2 — 市場環境

從兩個 division 的 `market_summary` 各取一段，並排顯示：

```tsx
<section>
  <h2 className="text-lg font-semibold text-slate-900 mb-3">市場環境</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {divisions.map((div) => (
      <div key={div.division} className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500 mb-1">{div.division_manager} · {div.division}</p>
        <p className="text-sm text-slate-700">{div.market_summary ?? "—"}</p>
      </div>
    ))}
  </div>
</section>
```

---

### Section 3 — AI 團隊總結

10 個 team 按 division 分組，每個 team 顯示一行：team name、最重要行動、信心。

```tsx
<section>
  <h2 className="text-lg font-semibold text-slate-900 mb-3">AI 團隊總結</h2>
  {["GPT Division", "Claude Division"].map((divName) => {
    const divTeams = teamReports.filter((t) => t.division === divName);
    return (
      <div key={divName} className="mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{divName}</p>
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">Team</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">今日最重要行動</th>
                <th className="px-4 py-2 text-right text-xs text-slate-500 font-medium">信心</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {divTeams.map((team) => {
                const view = team.final_team_view as { summary?: string; mostImportantAction?: string; confidence?: number } | null;
                return (
                  <tr key={team.team_name}>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {team.team_name}
                      <span className="ml-2 text-xs text-slate-400">{team.team_leader}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{view?.mostImportantAction ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{view?.confidence != null ? `${view.confidence}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  })}
</section>
```

---

### Section 4 — Committee A vs B 對比（核心）

```tsx
<section>
  <h2 className="text-lg font-semibold text-slate-900 mb-3">委員會決策對比</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {committees.map((c, i) => {
      const label = c.model_provider === "OpenAI" ? "Committee A · GPT" : "Committee B · Claude";
      const actionAllowedColor = c.is_action_allowed ? "text-green-700 bg-green-50" : "text-slate-600 bg-slate-50";
      return (
        <div key={i} className="rounded-md border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">{label}</p>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${actionAllowedColor}`}>
              {c.is_action_allowed ? "允許行動" : "觀望"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-500">結論：</span><span className="font-medium text-slate-800">{c.action_type ?? "—"}</span></div>
            <div><span className="text-slate-500">共識：</span><span className="font-medium text-slate-800">{c.consensus_level ?? "—"}</span></div>
            <div><span className="text-slate-500">信心：</span><span className="font-medium text-slate-800">{c.confidence != null ? `${c.confidence}%` : "—"}</span></div>
            <div><span className="text-slate-500">進場：</span><span className="font-medium text-slate-800">{c.final_buy_zone ?? "—"}</span></div>
            <div><span className="text-slate-500">目標：</span><span className="font-medium text-slate-800">{c.final_target_price ?? "—"}</span></div>
            <div><span className="text-slate-500">停損：</span><span className="font-medium text-slate-800">{c.final_stop_loss ?? "—"}</span></div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">決策理由</p>
            <p className="text-sm text-slate-700">{c.reason ?? "—"}</p>
          </div>

          {Array.isArray(c.agreements) && c.agreements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-700 mb-1">共識點</p>
              <ul className="text-sm text-slate-700 space-y-0.5">
                {(c.agreements as string[]).map((a, j) => <li key={j}>· {a}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(c.disagreements) && c.disagreements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-700 mb-1">分歧點</p>
              <ul className="text-sm text-slate-700 space-y-0.5">
                {(c.disagreements as string[]).map((d, j) => <li key={j}>· {d}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(c.what_could_change_decision) && c.what_could_change_decision.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-700 mb-1">可能改變決策的因素</p>
              <ul className="text-sm text-slate-700 space-y-0.5">
                {(c.what_could_change_decision as string[]).map((w, j) => <li key={j}>· {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      );
    })}
  </div>
</section>
```

---

### Section 5 — 具體建議清單

從兩個 committee 的 `final_recommendations` 合併顯示，標注來源（A 或 B）：

```tsx
<section>
  <h2 className="text-lg font-semibold text-slate-900 mb-3">具體建議清單</h2>
  {committees.map((c, i) => {
    const recs = (c.final_recommendations ?? []) as Array<Record<string, unknown>>;
    if (recs.length === 0) return null;
    const label = c.model_provider === "OpenAI" ? "Committee A" : "Committee B";
    return (
      <div key={i} className="mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
        <div className="rounded-md border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">標的</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">操作</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">進場區間</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">目標</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">停損</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">倉位</th>
                <th className="px-4 py-2 text-left text-xs text-slate-500 font-medium">信心</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recs.map((rec, j) => (
                <tr key={j}>
                  <td className="px-4 py-3 font-medium text-slate-800">{String(rec.ticker ?? rec.symbol ?? rec.security ?? "—")}</td>
                  <td className="px-4 py-3 text-slate-700">{String(rec.action ?? "—")}</td>
                  <td className="px-4 py-3 text-slate-700">{String(rec.buyZoneLow ?? rec.buy_zone_low ?? "—")} – {String(rec.buyZoneHigh ?? rec.buy_zone_high ?? "—")}</td>
                  <td className="px-4 py-3 text-slate-700">{String(rec.targetPrice ?? rec.target_price ?? "—")}</td>
                  <td className="px-4 py-3 text-slate-700">{String(rec.stopLoss ?? rec.stop_loss ?? "—")}</td>
                  <td className="px-4 py-3 text-slate-700">{String(rec.positionSizePct ?? rec.position_size_pct ?? "—")}</td>
                  <td className="px-4 py-3 text-slate-700">{String(rec.confidence ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  })}
</section>
```

---

### Section 6 — CIO 決策欄

純展示，不需要儲存到 DB。讓使用者知道今天兩個 committee 的最終立場，自行決定。

```tsx
<section className="rounded-md border-2 border-slate-300 bg-slate-50 p-5">
  <h2 className="text-lg font-semibold text-slate-900 mb-3">CIO 決策</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {committees.map((c, i) => {
      const label = c.model_provider === "OpenAI" ? "採用 Committee A（GPT 視角）" : "採用 Committee B（Claude 視角）";
      return (
        <div key={i} className="rounded-md border border-slate-300 bg-white p-4 flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <div>
            <p className="font-medium text-slate-800">{label}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {c.action_type} · 信心 {c.confidence ?? "—"}% · {c.is_action_allowed ? "允許行動" : "建議觀望"}
            </p>
          </div>
        </div>
      );
    })}
  </div>
  <p className="mt-4 text-xs text-slate-400">勾選僅作本地記錄，不影響系統資料。</p>
</section>
```

---

## 注意事項

- `final_scenarios` 欄位目前有可能不存在（有 schema workaround）— 本頁不查此欄，避免錯誤
- `committees[0]` 是 Committee A（GPT），`committees[1]` 是 Committee B（Claude）— 依 `model_provider` 欄位判斷，不要依賴排序
- 若 `committees` 只有 1 筆（舊資料）— 只顯示那 1 筆，不要 crash
- 若 `teamReports` 為空或 `committees` 為空 — 顯示「分析尚未完成，請執行每日分析」

---

## 不需要改的

- `reports/page.tsx`（歷史列表）— 不動
- `reports/[id]/page.tsx` — 不動（另外的 ticket）
- DB schema — 不動（`model_provider` 欄位在 prompt-37 已加）
- Navigation / layout — 不動
