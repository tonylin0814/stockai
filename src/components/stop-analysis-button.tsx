"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text.slice(0, 200) || `伺服器錯誤 (HTTP ${response.status})` };
  }
}

export function StopAnalysisButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stopAnalysis() {
    if (!window.confirm("確定要停止目前分析嗎？這會避免後續 API 費用。")) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/analysis/daily/stop", { method: "POST" });
      const data = await readResponse(response);
      if (!response.ok) {
        setError((data.error as string) || `伺服器錯誤 (HTTP ${response.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止分析失敗。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="danger" onClick={stopAnalysis} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
        停止分析
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
