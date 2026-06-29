"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunAnalysisButton({ label = "執行今日分析" }: { label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analysis/daily", { method: "POST" });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "分析執行失敗。");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析執行失敗。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={runAnalysis} disabled={loading}>
        {loading ? <RotateCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {loading ? "分析執行中…" : label}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
