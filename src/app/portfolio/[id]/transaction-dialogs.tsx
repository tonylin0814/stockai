"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit, Loader2, Minus, Plus } from "lucide-react";
import {
  createPortfolioTransaction,
  updatePortfolioTransaction
} from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type PortfolioTransactionFormValue = {
  id: string;
  holding_id: string;
  transaction_type: "buy" | "sell";
  trade_date: string;
  shares: number;
  price: number;
  currency: "TWD" | "USD";
  fees: number;
  notes: string | null;
};

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function TransactionForm({
  action,
  holdingId,
  defaultCurrency,
  transaction,
  transactionType,
  onSuccess
}: {
  action: (formData: FormData) => Promise<void>;
  holdingId: string;
  defaultCurrency: "TWD" | "USD";
  transaction?: PortfolioTransactionFormValue;
  transactionType?: "buy" | "sell";
  onSuccess: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const type = transaction?.transaction_type ?? transactionType ?? "buy";

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        formRef.current?.reset();
        onSuccess();
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "交易儲存失敗。");
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="holding_id" value={holdingId} />
      {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}
      <FormField label="類型" htmlFor={`transaction-type-${transaction?.id ?? type}`}>
        <Select
          id={`transaction-type-${transaction?.id ?? type}`}
          name="transaction_type"
          defaultValue={type}
          disabled={isPending}
          required
        >
          <option value="buy">買入</option>
          <option value="sell">賣出</option>
        </Select>
      </FormField>
      <FormField label="日期" htmlFor={`trade-date-${transaction?.id ?? type}`}>
        <Input
          id={`trade-date-${transaction?.id ?? type}`}
          name="trade_date"
          type="date"
          defaultValue={transaction?.trade_date ?? todayText()}
          disabled={isPending}
          required
        />
      </FormField>
      <FormField label="股數" htmlFor={`transaction-shares-${transaction?.id ?? type}`}>
        <Input
          id={`transaction-shares-${transaction?.id ?? type}`}
          name="shares"
          type="number"
          min="0.0001"
          step="0.0001"
          defaultValue={transaction?.shares ?? ""}
          disabled={isPending}
          required
        />
      </FormField>
      <FormField label="價格" htmlFor={`transaction-price-${transaction?.id ?? type}`}>
        <Input
          id={`transaction-price-${transaction?.id ?? type}`}
          name="price"
          type="number"
          min="0"
          step="0.0001"
          defaultValue={transaction?.price ?? ""}
          disabled={isPending}
          required
        />
      </FormField>
      <FormField label="幣別" htmlFor={`transaction-currency-${transaction?.id ?? type}`}>
        <Select
          id={`transaction-currency-${transaction?.id ?? type}`}
          name="currency"
          defaultValue={transaction?.currency ?? defaultCurrency}
          disabled={isPending}
          required
        >
          <option value="TWD">TWD</option>
          <option value="USD">USD</option>
        </Select>
      </FormField>
      <FormField label="手續費" htmlFor={`transaction-fees-${transaction?.id ?? type}`}>
        <Input
          id={`transaction-fees-${transaction?.id ?? type}`}
          name="fees"
          type="number"
          min="0"
          step="0.0001"
          defaultValue={transaction?.fees ?? 0}
          disabled={isPending}
        />
      </FormField>
      <div className="md:col-span-2">
        <FormField label="備註" htmlFor={`transaction-notes-${transaction?.id ?? type}`}>
          <Textarea
            id={`transaction-notes-${transaction?.id ?? type}`}
            name="notes"
            defaultValue={transaction?.notes ?? ""}
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
          {isPending ? "儲存中..." : "儲存交易"}
        </Button>
      </div>
    </form>
  );
}

export function AddTransactionDialog({
  holdingId,
  defaultCurrency,
  transactionType
}: {
  holdingId: string;
  defaultCurrency: "TWD" | "USD";
  transactionType: "buy" | "sell";
}) {
  const isBuy = transactionType === "buy";

  return (
    <Dialog
      title={isBuy ? "買入" : "賣出"}
      trigger={
        <Button type="button" variant={isBuy ? "primary" : "secondary"} size="sm">
          {isBuy ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
          {isBuy ? "買入" : "賣出"}
        </Button>
      }
    >
      {(close) => (
        <TransactionForm
          action={createPortfolioTransaction}
          holdingId={holdingId}
          defaultCurrency={defaultCurrency}
          transactionType={transactionType}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}

export function EditTransactionDialog({
  transaction,
  defaultCurrency
}: {
  transaction: PortfolioTransactionFormValue;
  defaultCurrency: "TWD" | "USD";
}) {
  return (
    <Dialog
      title="編輯交易"
      trigger={
        <Button type="button" variant="secondary" size="icon" aria-label="編輯交易" title="編輯交易">
          <Edit className="h-4 w-4" />
        </Button>
      }
    >
      {(close) => (
        <TransactionForm
          action={updatePortfolioTransaction}
          holdingId={transaction.holding_id}
          defaultCurrency={defaultCurrency}
          transaction={transaction}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}
