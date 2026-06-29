import { Suspense } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Eye } from "lucide-react";
import AlertsPanel from "@/components/alerts-panel";
import CostSummary from "@/components/cost-summary";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const displayName = user?.email ?? "使用者";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">總覽</h1>
        <p className="mt-1 text-sm text-slate-600">歡迎，{displayName}</p>
      </div>

      {user ? (
        <Suspense fallback={null}>
          <AlertsPanel userId={user.id} />
        </Suspense>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/portfolio"
          className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300"
        >
          <BriefcaseBusiness className="mb-3 h-5 w-5 text-slate-700" />
          <h2 className="font-semibold text-slate-950">投資組合</h2>
          <p className="mt-1 text-sm text-slate-600">新增、編輯與管理持股。</p>
        </Link>
        <Link
          href="/watchlist"
          className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300"
        >
          <Eye className="mb-3 h-5 w-5 text-slate-700" />
          <h2 className="font-semibold text-slate-950">關注清單</h2>
          <p className="mt-1 text-sm text-slate-600">追蹤候選股票與 ETF。</p>
        </Link>
      </div>

      {user ? (
        <Suspense fallback={null}>
          <CostSummary userId={user.id} />
        </Suspense>
      ) : null}
    </div>
  );
}
