"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { closePaperTrade } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "儲存中..." : "確認平倉"}</Button>;
}

export default function ClosePaperTradePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, action] = useFormState(closePaperTrade, null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state?.success) router.push("/paper-trades");
  }, [router, state]);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-950">平倉模擬交易</h1>
      <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value={params.id} />
        <FormField label="出場日" htmlFor="exitDate">
          <Input id="exitDate" name="exitDate" type="date" defaultValue={today} required />
        </FormField>
        <FormField label="出場價" htmlFor="exitPrice">
          <Input id="exitPrice" name="exitPrice" type="number" min="0" step="0.0001" required />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="狀態" htmlFor="status">
            <Select id="status" name="status" defaultValue="closed" required>
              <option value="closed">已平倉</option>
              <option value="target_hit">達目標</option>
              <option value="stop_hit">停損</option>
            </Select>
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
