import { Edit, Plus, Trash2 } from "lucide-react";
import {
  createWatchlistItem,
  deleteWatchlistItem,
  updateWatchlistItem
} from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function WatchlistForm({
  action,
  item
}: {
  action: (formData: FormData) => Promise<void>;
  item?: WatchlistItem;
}) {
  const security = item?.securities;

  return (
    <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormField label="市場" htmlFor={`market-${item?.id ?? "new"}`}>
        <Select
          id={`market-${item?.id ?? "new"}`}
          name="market"
          defaultValue={security?.market ?? "TW"}
          required
        >
          <option value="TW">台股</option>
          <option value="US">美股</option>
        </Select>
      </FormField>
      <FormField label="股票代號" htmlFor={`symbol-${item?.id ?? "new"}`}>
        <Input
          id={`symbol-${item?.id ?? "new"}`}
          name="symbol"
          defaultValue={security?.symbol ?? ""}
          required
        />
      </FormField>
      <FormField label="名稱" htmlFor={`name-${item?.id ?? "new"}`}>
        <Input
          id={`name-${item?.id ?? "new"}`}
          name="name"
          defaultValue={security?.name ?? ""}
          required
        />
      </FormField>
      <FormField label="類型" htmlFor={`security_type-${item?.id ?? "new"}`}>
        <Select
          id={`security_type-${item?.id ?? "new"}`}
          name="security_type"
          defaultValue={security?.security_type ?? "stock"}
          required
        >
          <option value="stock">股票</option>
          <option value="etf">ETF</option>
        </Select>
      </FormField>
      <FormField label="目標買進價" htmlFor={`target_buy_price-${item?.id ?? "new"}`}>
        <Input
          id={`target_buy_price-${item?.id ?? "new"}`}
          name="target_buy_price"
          type="number"
          min="0"
          step="0.0001"
          defaultValue={item?.target_buy_price ?? ""}
        />
      </FormField>
      <FormField label="警示價格" htmlFor={`alert_price-${item?.id ?? "new"}`}>
        <Input
          id={`alert_price-${item?.id ?? "new"}`}
          name="alert_price"
          type="number"
          min="0"
          step="0.0001"
          defaultValue={item?.alert_price ?? ""}
        />
      </FormField>
      <FormField label="狀態" htmlFor={`status-${item?.id ?? "new"}`}>
        <Select
          id={`status-${item?.id ?? "new"}`}
          name="status"
          defaultValue={item?.status ?? "觀察中"}
          required
        >
          <option value="觀察中">觀察中</option>
          <option value="候選">候選</option>
          <option value="暫不考慮">暫不考慮</option>
        </Select>
      </FormField>
      <FormField label="可見性" htmlFor={`visibility-${item?.id ?? "new"}`}>
        <Select
          id={`visibility-${item?.id ?? "new"}`}
          name="visibility"
          defaultValue={item?.visibility ?? "private"}
          required
        >
          <option value="private">private</option>
          <option value="family_shared">family_shared</option>
        </Select>
      </FormField>
      <div className="md:col-span-2">
        <FormField label="關注原因" htmlFor={`reason-${item?.id ?? "new"}`}>
          <Textarea
            id={`reason-${item?.id ?? "new"}`}
            name="reason"
            defaultValue={item?.reason ?? ""}
          />
        </FormField>
      </div>
      <div className="md:col-span-2">
        <FormField label="備註" htmlFor={`notes-${item?.id ?? "new"}`}>
          <Textarea
            id={`notes-${item?.id ?? "new"}`}
            name="notes"
            defaultValue={item?.notes ?? ""}
          />
        </FormField>
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button type="submit">{item ? "儲存變更" : "新增項目"}</Button>
      </div>
    </form>
  );
}

export default async function WatchlistPage() {
  const supabase = createSupabaseServerClient();
  const { data: items, error } = await supabase
    .from("watchlist_items")
    .select(
      "id, visibility, reason, target_buy_price, alert_price, status, notes, securities(symbol, market, name, security_type)"
    )
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
        <Dialog
          title="新增關注項目"
          trigger={
            <Button type="button">
              <Plus className="h-4 w-4" />
              新增項目
            </Button>
          }
        >
          <WatchlistForm action={createWatchlistItem} />
        </Dialog>
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
                <Td>{item.securities?.symbol}</Td>
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
                    <Dialog
                      title="編輯關注項目"
                      trigger={
                        <Button type="button" variant="secondary" size="sm">
                          <Edit className="h-4 w-4" />
                          編輯
                        </Button>
                      }
                    >
                      <WatchlistForm action={updateWatchlistItem} item={item} />
                    </Dialog>
                    <form action={deleteWatchlistItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button type="submit" variant="danger" size="sm">
                        <Trash2 className="h-4 w-4" />
                        刪除
                      </Button>
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
