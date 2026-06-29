"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

async function readResponse(response: Response, setError: (message: string) => void) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    const text = await response.text().catch(() => "");
    setError(text.slice(0, 200) || `伺服器錯誤 (HTTP ${response.status})`);
    return null;
  }
}

export function RunAnalysisButton({
  label = "執行今日分析",
  redirectTo
}: {
  label?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analysis/daily", { method: "POST" });
      const data = await readResponse(response, setError);

      if (!data) return;

      if (!response.ok) {
        setError((data.error as string) || `伺服器錯誤 (HTTP ${response.status})`);
        return;
      }

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
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
        {loading ? "分析執行中..." : label}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
