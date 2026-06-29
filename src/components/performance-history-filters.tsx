"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function PerformanceHistoryFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function applyFilters(formData: FormData) {
    const next = new URLSearchParams();

    for (const key of ["source_type", "action", "market", "from", "to"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }

    router.push(`/performance/history${next.size > 0 ? `?${next.toString()}` : ""}`);
  }

  function clearFilters() {
    router.push("/performance/history");
  }

  return (
    <form action={applyFilters} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6">
      <Select name="source_type" defaultValue={params.get("source_type") ?? ""} aria-label="來源類型">
        <option value="">全部來源</option>
        <option value="team">團隊</option>
        <option value="division">Division</option>
        <option value="committee">委員會</option>
      </Select>
      <Select name="action" defaultValue={params.get("action") ?? ""} aria-label="建議動作">
        <option value="">全部動作</option>
        <option value="buy">buy</option>
        <option value="small_buy">small_buy</option>
        <option value="add">add</option>
        <option value="hold">hold</option>
        <option value="wait">wait</option>
        <option value="sell">sell</option>
        <option value="reduce">reduce</option>
        <option value="avoid">avoid</option>
      </Select>
      <Select name="market" defaultValue={params.get("market") ?? ""} aria-label="市場">
        <option value="">全部市場</option>
        <option value="TW">TW</option>
        <option value="US">US</option>
      </Select>
      <Input type="date" name="from" defaultValue={params.get("from") ?? ""} aria-label="開始日期" />
      <Input type="date" name="to" defaultValue={params.get("to") ?? ""} aria-label="結束日期" />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          <Filter className="h-4 w-4" />
          篩選
        </Button>
        <Button type="button" variant="secondary" size="icon" onClick={clearFilters} aria-label="清除篩選">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
