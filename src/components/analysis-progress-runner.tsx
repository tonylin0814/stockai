"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AnalysisProgressRunner({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  const runningRef = useRef(false);

  useEffect(() => {
    async function tick() {
      if (runningRef.current) {
        return;
      }

      runningRef.current = true;
      try {
        await fetch("/api/analysis/daily/continue", { method: "POST" });
      } finally {
        runningRef.current = false;
        router.refresh();
      }
    }

    void tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, router]);

  return null;
}
