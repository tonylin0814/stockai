"use client";

import { useEffect, useState } from "react";
import { isMarketOpen } from "@/lib/market-hours";

interface MarketStatusDotProps {
  market: "US" | "TW";
}

export function MarketStatusDot({ market }: MarketStatusDotProps) {
  const [open, setOpen] = useState(() => isMarketOpen(market));

  useEffect(() => {
    const id = window.setInterval(() => {
      setOpen(isMarketOpen(market));
    }, 60_000);

    return () => window.clearInterval(id);
  }, [market]);

  return (
    <span
      title={open ? `${market === "TW" ? "台股" : "美股"}開市中` : "休市中"}
      className={`inline-block h-2 w-2 rounded-full ${
        open ? "bg-green-500" : "bg-slate-300"
      }`}
    />
  );
}
