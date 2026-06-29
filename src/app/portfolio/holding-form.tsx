"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type HoldingFormValue = {
  id: string;
  shares: number;
  average_cost: number;
  cost_currency: string;
  strategy: string | null;
  notes: string | null;
  opened_at: string | null;
  securities: {
    symbol: string;
    market: string;
    name: string;
    security_type: string;
  } | null;
};

export function HoldingForm({
  action,
  holding,
  onSuccess
}: {
  action: (formData: FormData) => Promise<void>;
  holding?: HoldingFormValue;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const security = holding?.securities;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        formRef.current?.reset();
        onSuccess();
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "儲存失敗，請稍後再試。");
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {holding ? <input type="hidden" name="id" value={holding.id} /> : null}
      <FormField label="市場" htmlFor={`market-${holding?.id ?? "new"}`}>
        <Select
          id={`market-${holding?.id ?? "new"}`}
          name="market"
          defaultValue={security?.market ?? "TW"}
          required
          disabled={isPending}
        >
          <option value="TW">台股</option>
          <option value="US">美股</option>
        </Select>
      </FormField>
      <FormField label="股票代號" htmlFor={`symbol-${holding?.id ?? "new"}`}>
        <Input
          id={`symbol-${holding?.id ?? "new"}`}
          name="symbol"
          defaultValue={security?.symbol ?? ""}
          required
          disabled={isPending}
        />
      </FormField>
      <FormField label="名稱" htmlFor={`name-${holding?.id ?? "new"}`}>
        <Input
          id={`name-${holding?.id ?? "new"}`}
          name="name"
          defaultValue={security?.name ?? ""}
          required
          disabled={isPending}
        />
      </FormField>
      <FormField label="類型" htmlFor={`security_type-${holding?.id ?? "new"}`}>
        <Select
          id={`security_type-${holding?.id ?? "new"}`}
          name="security_type"
          defaultValue={security?.security_type ?? "stock"}
          required
          disabled={isPending}
        >
          <option value="stock">股票</option>
          <option value="etf">ETF</option>
        </Select>
      </FormField>
      <FormField label="持有股數" htmlFor={`shares-${holding?.id ?? "new"}`}>
        <Input
          id={`shares-${holding?.id ?? "new"}`}
          name="shares"
          type="number"
          min="0"
          step="0.0001"
          defaultValue={holding?.shares ?? ""}
          required
          disabled={isPending}
        />
      </FormField>
      <FormField label="平均成本" htmlFor={`average_cost-${holding?.id ?? "new"}`}>
        <Input
          id={`average_cost-${holding?.id ?? "new"}`}
          name="average_cost"
          type="number"
          min="0"
          step="0.0001"
          defaultValue={holding?.average_cost ?? ""}
          required
          disabled={isPending}
        />
      </FormField>
      <FormField label="成本幣別" htmlFor={`cost_currency-${holding?.id ?? "new"}`}>
        <Select
          id={`cost_currency-${holding?.id ?? "new"}`}
          name="cost_currency"
          defaultValue={holding?.cost_currency ?? "TWD"}
          required
          disabled={isPending}
        >
          <option value="TWD">TWD</option>
          <option value="USD">USD</option>
        </Select>
      </FormField>
      <FormField label="策略" htmlFor={`strategy-${holding?.id ?? "new"}`}>
        <Select
          id={`strategy-${holding?.id ?? "new"}`}
          name="strategy"
          defaultValue={holding?.strategy ?? "長期"}
          required
          disabled={isPending}
        >
          <option value="長期">長期</option>
          <option value="波段">波段</option>
          <option value="短線">短線</option>
          <option value="觀察">觀察</option>
        </Select>
      </FormField>
      <FormField label="建倉日期" htmlFor={`opened_at-${holding?.id ?? "new"}`}>
        <Input
          id={`opened_at-${holding?.id ?? "new"}`}
          name="opened_at"
          type="date"
          defaultValue={holding?.opened_at ?? ""}
          disabled={isPending}
        />
      </FormField>
      <div className="md:col-span-2">
        <FormField label="備註" htmlFor={`notes-${holding?.id ?? "new"}`}>
          <Textarea
            id={`notes-${holding?.id ?? "new"}`}
            name="notes"
            defaultValue={holding?.notes ?? ""}
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
          {isPending ? "儲存中..." : holding ? "儲存變更" : "新增持股"}
        </Button>
      </div>
    </form>
  );
}
