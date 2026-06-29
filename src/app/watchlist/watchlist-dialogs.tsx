"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit, Loader2, Plus } from "lucide-react";
import {
  createWatchlistItem,
  updateWatchlistItem
} from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type WatchlistFormValue = {
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
  item,
  onSuccess
}: {
  action: (formData: FormData) => Promise<void>;
  item?: WatchlistFormValue;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const security = item?.securities;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        formRef.current?.reset();
        onSuccess();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "儲存失敗，請稍後再試。"
        );
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormField label="市場" htmlFor={`market-${item?.id ?? "new"}`}>
        <Select
          id={`market-${item?.id ?? "new"}`}
          name="market"
          defaultValue={security?.market ?? "TW"}
          required
          disabled={isPending}
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
          disabled={isPending}
        />
      </FormField>
      <FormField label="名稱" htmlFor={`name-${item?.id ?? "new"}`}>
        <Input
          id={`name-${item?.id ?? "new"}`}
          name="name"
          defaultValue={security?.name ?? ""}
          required
          disabled={isPending}
        />
      </FormField>
      <FormField label="類型" htmlFor={`security_type-${item?.id ?? "new"}`}>
        <Select
          id={`security_type-${item?.id ?? "new"}`}
          name="security_type"
          defaultValue={security?.security_type ?? "stock"}
          required
          disabled={isPending}
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
          disabled={isPending}
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
          disabled={isPending}
        />
      </FormField>
      <FormField label="狀態" htmlFor={`status-${item?.id ?? "new"}`}>
        <Select
          id={`status-${item?.id ?? "new"}`}
          name="status"
          defaultValue={item?.status ?? "觀察中"}
          required
          disabled={isPending}
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
          disabled={isPending}
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
            disabled={isPending}
          />
        </FormField>
      </div>
      <div className="md:col-span-2">
        <FormField label="備註" htmlFor={`notes-${item?.id ?? "new"}`}>
          <Textarea
            id={`notes-${item?.id ?? "new"}`}
            name="notes"
            defaultValue={item?.notes ?? ""}
            disabled={isPending}
          />
        </FormField>
      </div>
      {error ? (
        <p className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? "儲存中..." : item ? "儲存變更" : "新增項目"}
        </Button>
      </div>
    </form>
  );
}

export function AddWatchlistDialog() {
  return (
    <Dialog
      title="新增關注項目"
      trigger={
        <Button type="button">
          <Plus className="h-4 w-4" />
          新增項目
        </Button>
      }
    >
      {(close) => <WatchlistForm action={createWatchlistItem} onSuccess={close} />}
    </Dialog>
  );
}

export function EditWatchlistDialog({ item }: { item: WatchlistFormValue }) {
  return (
    <Dialog
      title="編輯關注項目"
      trigger={
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="編輯"
          title="編輯"
        >
          <Edit className="h-4 w-4" />
        </Button>
      }
    >
      {(close) => (
        <WatchlistForm action={updateWatchlistItem} item={item} onSuccess={close} />
      )}
    </Dialog>
  );
}
