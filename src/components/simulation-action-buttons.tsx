"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, FileText, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActionKey = "trade" | "report" | "weekly" | "reset";

const actions: Record<
  ActionKey,
  { label: string; loading: string; path: string; icon: typeof Play }
> = {
  trade: {
    label: "執行今日交易",
    loading: "交易執行中...",
    path: "/api/simulation/trade-session",
    icon: Play
  },
  report: {
    label: "產生日報",
    loading: "日報產生中...",
    path: "/api/simulation/end-of-day",
    icon: FileText
  },
  weekly: {
    label: "每週評估",
    loading: "評估中...",
    path: "/api/simulation/weekly-eval",
    icon: BarChart3
  },
  reset: {
    label: "重置交易",
    loading: "重置中...",
    path: "/api/simulation/reset",
    icon: RotateCcw
  }
};

async function readJson(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text.slice(0, 200) || `伺服器錯誤 (HTTP ${response.status})` };
  }
}

export function SimulationActionButtons() {
  const router = useRouter();
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(key: ActionKey) {
    setRunning(key);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(actions[key].path, { method: "POST" });
      const data = await readJson(response);

      if (!response.ok) {
        setError(String(data.error ?? `伺服器錯誤 (HTTP ${response.status})`));
        return;
      }

      setMessage(String(data.message ?? "完成。"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗。");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(actions) as ActionKey[]).map((key) => {
          const Icon = actions[key].icon;
          return (
            <Button
              key={key}
              type="button"
              variant={key === "trade" ? "primary" : "secondary"}
              onClick={() => runAction(key)}
              disabled={running !== null}
            >
              <Icon className={`h-4 w-4 ${running === key ? "animate-spin" : ""}`} />
              {running === key ? actions[key].loading : actions[key].label}
            </Button>
          );
        })}
      </div>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
