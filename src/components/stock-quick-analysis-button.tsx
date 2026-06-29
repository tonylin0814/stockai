"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

async function readResponse(response: Response, setError: (message: string) => void) {
  try {
    return (await response.json()) as { missionId?: string; error?: string };
  } catch {
    const text = await response.text().catch(() => "");
    setError(text.slice(0, 200) || `伺服器錯誤 (HTTP ${response.status})`);
    return null;
  }
}

export function StockQuickAnalysisButton({
  holdingId,
  redirectTo
}: {
  holdingId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch(`/api/analysis/stock-detail/${holdingId}`, {
        method: "POST"
      });
      const data = await readResponse(response, setError);

      if (!data) {
        setStatus("error");
        return;
      }

      if (!response.ok) {
        setError(data.error || `伺服器錯誤 (HTTP ${response.status})`);
        setStatus("error");
        return;
      }

      setStatus("done");

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知錯誤");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            分析中...約 20-40 秒
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            重新執行 AI 分析
          </>
        )}
      </Button>
      {status === "error" && error ? <p className="text-xs text-red-600">{error}</p> : null}
      {status === "done" ? (
        <p className="text-xs text-green-600">分析完成，頁面更新中...</p>
      ) : null}
    </div>
  );
}
