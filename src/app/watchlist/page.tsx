import Link from "next/link";
import { deleteWatchlistItem } from "@/app/actions";
import {
  AddWatchlistDialog,
  EditWatchlistDialog,
  type WatchlistFormValue
} from "@/app/watchlist/watchlist-dialogs";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Table, Td, Th } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WatchlistItem = {
  id: string;
  visibility: string;
  reason: string | null;
  target_buy_price: number | null;
  alert_price: number | null;
  status: string | null;
  notes: string | null;
  securities: {
    symbol: string;
    market: string;
    name: string;
    security_type: string;
  } | null;
};

export default async function WatchlistPage() {
  const authClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
        請先登入後查看關注清單。
      </div>
    );
  }

  const supabase = createSupabaseServiceClient();
  const { data: items, error } = await supabase
    .from("stocks_watchlist_items")
    .select(
      "id, visibility, reason, target_buy_price, alert_price, status, notes, securities:stocks_securities(symbol, market, name, security_type)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (items ?? []) as unknown as WatchlistItem[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">關注清單</h1>
          <p className="mt-1 text-sm text-slate-600">管理候選股票、ETF 與追蹤理由。</p>
        </div>
        <AddWatchlistDialog />
      </div>

      <Table>
        <thead>
          <tr>
            <Th>代號</Th>
            <Th>名稱</Th>
            <Th>市場</Th>
            <Th>類型</Th>
            <Th>原因</Th>
            <Th>目標買進價</Th>
            <Th>警示價格</Th>
            <Th>狀態</Th>
            <Th>可見性</Th>
            <Th>備註</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((item) => (
              <tr key={item.id}>
                <Td>
                  <Link href={`/watchlist/${item.id}`} className="font-medium text-blue-700 hover:underline">
                    {item.securities?.symbol}
                  </Link>
                </Td>
                <Td>{item.securities?.name}</Td>
                <Td>{item.securities?.market}</Td>
                <Td>{item.securities?.security_type}</Td>
                <Td>{item.reason || "—"}</Td>
                <Td>{item.target_buy_price ?? "—"}</Td>
                <Td>{item.alert_price ?? "—"}</Td>
                <Td>{item.status}</Td>
                <Td>{item.visibility}</Td>
                <Td>{item.notes || "—"}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <EditWatchlistDialog item={item as WatchlistFormValue} />
                    <form action={deleteWatchlistItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <ConfirmSubmitButton idleLabel="刪除" confirmLabel="再次點擊確認刪除" />
                    </form>
                  </div>
                </Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={11} className="py-8 text-center text-slate-500">
                尚未建立關注項目。
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
