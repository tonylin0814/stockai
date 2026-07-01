"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createMission } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function MissionForm({ onSaved }: { onSaved: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        await createMission(formData);
        router.refresh();
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "任務建立失敗。");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField label="任務標題" htmlFor="title">
        <Input id="title" name="title" required />
      </FormField>
      <FormField label="任務類型" htmlFor="mission_type">
        <Select id="mission_type" name="mission_type" required defaultValue="single_stock">
          <option value="single_stock">單一股票分析</option>
          <option value="multi_stock">多股票比較</option>
          <option value="portfolio_review">投資組合檢視</option>
          <option value="watchlist_review">關注清單檢視</option>
          <option value="theme">主題研究</option>
          <option value="event">事件分析</option>
        </Select>
      </FormField>
      <div className="md:col-span-2">
        <FormField label="原始問題" htmlFor="original_question">
          <Textarea id="original_question" name="original_question" required />
        </FormField>
      </div>
      <FormField label="相關股票代號" htmlFor="related_symbols">
        <Input id="related_symbols" name="related_symbols" placeholder="NVDA, TSMC, 2330" />
      </FormField>
      <FormField label="相關市場" htmlFor="related_market">
        <Select id="related_market" name="related_market" defaultValue="">
          <option value="">未指定</option>
          <option value="US">{"\u7f8e\u80a1"}</option>
          <option value="TW">{"\u53f0\u80a1"}</option>
        </Select>
      </FormField>
      {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? "建立中..." : "建立任務"}
        </Button>
      </div>
    </form>
  );
}
