"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createPaperTrade } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "儲存中..." : "新增模擬交易"}</Button>;
}

export default function NewPaperTradePage() {
  const router = useRouter();
  const [state, action] = useFormState(createPaperTrade, null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state?.success) router.push("/paper-trades");
  }, [router, state]);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-950">新增模擬交易</h1>
      <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="股票代號" htmlFor="symbol">
          <Input id="symbol" name="symbol" required />
        </FormField>
        <FormField label="市場" htmlFor="market">
          <Select id="market" name="market" defaultValue="US" required>
            <option value="US">US</option>
            <option value="TW">TW</option>
          </Select>
        </FormField>
        <FormField label="方向" htmlFor="direction">
          <Select id="direction" name="direction" defaultValue="long" required>
            <option value="long">做多</option>
            <option value="short">做空</option>
          </Select>
        </FormField>
        <FormField label="進場日" htmlFor="entryDate">
          <Input id="entryDate" name="entryDate" type="date" defaultValue={today} required />
        </FormField>
        <FormField label="進場價" htmlFor="entryPrice">
          <Input id="entryPrice" name="entryPrice" type="number" min="0" step="0.0001" required />
        </FormField>
        <FormField label="股數" htmlFor="shares">
          <Input id="shares" name="shares" type="number" min="0" step="0.0001" defaultValue="1" required />
        </FormField>
        <FormField label="目標價" htmlFor="targetPrice">
          <Input id="targetPrice" name="targetPrice" type="number" min="0" step="0.0001" />
        </FormField>
        <FormField label="停損價" htmlFor="stopLoss">
          <Input id="stopLoss" name="stopLoss" type="number" min="0" step="0.0001" />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="備註" htmlFor="notes">
            <Textarea id="notes" name="notes" />
          </FormField>
        </div>
        {state?.error ? <p className="text-sm text-red-700 md:col-span-2">{String(state.error)}</p> : null}
        <div className="flex justify-end md:col-span-2">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
