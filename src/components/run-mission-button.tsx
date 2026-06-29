"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunMissionButton({ missionId, label = "執行分析" }: { missionId: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runMission() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/analysis/mission/${missionId}`, { method: "POST" });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "任務分析失敗。");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "任務分析失敗。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={runMission} disabled={loading}>
        {loading ? <RotateCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {loading ? "分析執行中…" : label}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
