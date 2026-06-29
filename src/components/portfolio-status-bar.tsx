"use client";

import { useCallback, useState } from "react";
import { SmartAutoRefresh } from "@/components/smart-auto-refresh";
import { getMarketStatus, type MarketStatus } from "@/lib/market-hours";

export function PortfolioStatusBar() {
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus());
  const handleChange = useCallback((nextStatus: MarketStatus) => {
    setStatus(nextStatus);
  }, []);

  return (
    <>
      <SmartAutoRefresh onStatusChange={handleChange} />
      <span
        className={`text-xs font-medium ${
          status.open ? "text-green-600" : "text-slate-400"
        }`}
      >
        {status.label}
      </span>
    </>
  );
}
