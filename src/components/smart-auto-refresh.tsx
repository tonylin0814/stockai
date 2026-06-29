"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMarketStatus, type MarketStatus } from "@/lib/market-hours";

interface SmartAutoRefreshProps {
  onStatusChange?: (status: MarketStatus) => void;
}

export function SmartAutoRefresh({ onStatusChange }: SmartAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    function tick() {
      const status = getMarketStatus();
      onStatusChange?.(status);

      if (status.open) {
        router.refresh();
      }
    }

    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [router, onStatusChange]);

  return null;
}
