import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { notFound } from "next/navigation";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PortfolioMissionLink = {
  id: string;
  mission_id: string;
  security_id: string | null;
  created_at: string;
};

type MissionRow = {
  id: string;
  title: string;
  mission_type: string | null;
  status: string;
  created_at: string;
};

type SecurityRow = {
  id: string;
  symbol: string;
  market: string;
  name: string;
};

type DivisionDecisionRow = {
  id: string;
  daily_run_id: string | null;
  decision_action: string | null;
  portfolio_actions: unknown;
  created_at: string;
};

type DisplayRow = {
  id: string;
  symbol: string;
  market: string;
  name: string;
  title: string;
  source: string;
  action: string;
  status: string;
  createdAt: string;
  href?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function statusClass(status: string) {
  if (status === "completed") return "border-green-200 bg-green-50 text-green-800";
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "cancelled") return "border-slate-200 bg-slate-100 text-slate-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-800";
  return "border-yellow-200 bg-yellow-50 text-yellow-800";
}

function statusLabel(status: string) {
  if (status === "completed") return "完成";
  if (status === "running") return "執行中";
  if (status === "cancelled") return "已取消";
  if (status === "failed") return "失敗";
  return status || "-";
}

function missionTypeLabel(type: string | null) {
  if (type === "single_stock") return "單一股票分析";
  if (type === "multi_stock") return "多股票比較";
  if (type === "portfolio_review") return "投資組合檢視";
  if (type === "watchlist_review") return "關注清單檢視";
  if (type === "theme") return "主題研究";
  if (type === "event") return "事件分析";
  return type || "任務分析";
}

function actionLabel(value: unknown) {
  const action = String(value ?? "");
  const labels: Record<string, string> = {
    buy: "買進",
    small_buy: "小買",
    add: "加碼",
    hold: "持有",
    wait: "等待",
    reduce: "減碼",
    sell: "賣出",
    avoid: "避開",
    no_action: "不行動",
    watch: "觀察",
    "續抱": "續抱",
    "減碼": "減碼",
    "觀察": "觀察",
    insufficient_data: "資料不足"
  };
  return labels[action] ?? (action || "-");
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export default async function PortfolioAnalysisPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const [linkResult, holdingsResult, divisionResult] = await Promise.all([
    supabase
      .from("stocks_mission_links")
      .select("id, mission_id, security_id, created_at")
      .eq("user_id", user.id)
      .eq("link_type", "portfolio")
      .order("created_at", { ascending: false }),
    supabase
      .from("stocks_portfolio_holdings")
      .select("security_id, securities:stocks_securities(id, symbol, market, name)")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("stocks_division_decisions")
      .select("id, daily_run_id, decision_action, portfolio_actions, created_at")
      .eq("user_id", user.id)
      .not("daily_run_id", "is", null)
      .order("created_at", { ascending: false })
  ]);

  const initialError = linkResult.error ?? holdingsResult.error ?? divisionResult.error;
  if (initialError) {
    throw new Error(initialError.message);
  }

  const links = (linkResult.data ?? []) as unknown as PortfolioMissionLink[];
  const activeHoldings = ((holdingsResult.data ?? []) as unknown as Array<{
    security_id: string;
    securities: SecurityRow | null;
  }>).filter((holding) => holding.securities);
  const activeSymbols = new Set(activeHoldings.map((holding) => normalizeSymbol(holding.securities?.symbol)));
  const securitiesById = new Map(
    activeHoldings.map((holding) => [holding.security_id, holding.securities!])
  );
  const securitiesBySymbol = new Map(
    activeHoldings.map((holding) => [normalizeSymbol(holding.securities?.symbol), holding.securities!])
  );
  const missionIds = Array.from(new Set(links.map((row) => row.mission_id).filter(Boolean)));
  const linkSecurityIds = Array.from(
    new Set(links.map((row) => row.security_id).filter((id): id is string => Boolean(id)))
  );
  const missingSecurityIds = linkSecurityIds.filter((id) => !securitiesById.has(id));

  const [missionsResult, linkedSecuritiesResult] = await Promise.all([
    missionIds.length
      ? supabase
          .from("stocks_missions")
          .select("id, title, mission_type, status, created_at")
          .eq("user_id", user.id)
          .in("id", missionIds)
      : Promise.resolve({ data: [], error: null }),
    missingSecurityIds.length
      ? supabase
          .from("stocks_securities")
          .select("id, symbol, market, name")
          .in("id", missingSecurityIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const lookupError = missionsResult.error ?? linkedSecuritiesResult.error;
  if (lookupError) {
    throw new Error(lookupError.message);
  }

  for (const security of (linkedSecuritiesResult.data ?? []) as SecurityRow[]) {
    securitiesById.set(security.id, security);
    securitiesBySymbol.set(normalizeSymbol(security.symbol), security);
  }

  const missionsById = new Map(
    ((missionsResult.data ?? []) as MissionRow[]).map((mission) => [mission.id, mission])
  );
  const linkedRows: DisplayRow[] = links.flatMap((link) => {
    const mission = missionsById.get(link.mission_id);
    const security = link.security_id ? securitiesById.get(link.security_id) : null;
    if (!mission || !security) return [];

    return [
      {
        id: `mission-${link.id}`,
        symbol: security.symbol,
        market: security.market,
        name: security.name,
        title: mission.title,
        source: missionTypeLabel(mission.mission_type),
        action: "-",
        status: mission.status,
        createdAt: mission.created_at,
        href: `/missions/${mission.id}`
      }
    ];
  });

  const divisionRows: DisplayRow[] = ((divisionResult.data ?? []) as DivisionDecisionRow[]).flatMap(
    (decision) => {
      const actions = Array.isArray(decision.portfolio_actions)
        ? decision.portfolio_actions.map((item) => asRecord(item))
        : [];

      return actions.flatMap((action, index) => {
        const symbol = normalizeSymbol(action.symbol);
        if (!symbol || !activeSymbols.has(symbol)) return [];

        const security = securitiesBySymbol.get(symbol);
        const name = String(action.name ?? security?.name ?? "");

        return [
          {
            id: `division-${decision.id}-${symbol}-${index}`,
            symbol,
            market: security?.market ?? "-",
            name,
            title: `${symbol} ${name || "持股"} 投資分析`,
            source: "Portfolio 自動分析",
            action: actionLabel(action.action ?? decision.decision_action),
            status: "completed",
            createdAt: decision.created_at
          }
        ];
      });
    }
  );

  const rows = [...divisionRows, ...linkedRows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700">
            <BriefcaseBusiness className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold text-slate-950">我的投資分析</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          顯示 portfolio 持股相關的自動分析與手動關聯任務。
        </p>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>股票</Th>
            <Th>標題</Th>
            <Th>來源</Th>
            <Th>建議</Th>
            <Th>狀態</Th>
            <Th>建立時間</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                <Td>
                  <div className="font-medium text-slate-950">{row.symbol}</div>
                  <div className="text-xs text-slate-500">
                    {[row.market, row.name].filter(Boolean).join(" / ") || "-"}
                  </div>
                </Td>
                <Td>
                  {row.href ? (
                    <Link href={row.href} className="font-medium text-blue-700 hover:underline">
                      {row.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-950">{row.title}</span>
                  )}
                </Td>
                <Td>{row.source}</Td>
                <Td>{row.action}</Td>
                <Td>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium",
                      statusClass(row.status)
                    )}
                  >
                    {statusLabel(row.status)}
                  </span>
                </Td>
                <Td>{formatDateTime(row.createdAt)}</Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-slate-500">
                目前沒有 portfolio 股票分析紀錄。
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
