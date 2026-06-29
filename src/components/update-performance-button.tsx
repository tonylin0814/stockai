"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
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

export function UpdatePerformanceButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updatePerformance() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/performance/evaluate", { method: "POST" });
      const data = await readResponse(response, setError);

      if (!data) return;

      if (!response.ok) {
        setError((data.error as string) || `伺服器錯誤 (HTTP ${response.status})`);
        return;
      }

      setMessage(`${data.message ?? "績效更新完成。"} 已評估 ${data.evaluated ?? 0} 筆。`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "績效更新失敗。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={updatePerformance} disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "更新中..." : "更新績效"}
      </Button>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
