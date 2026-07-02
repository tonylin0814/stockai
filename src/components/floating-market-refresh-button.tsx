"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshMarketDataForPage } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

function formatTorontoMinute(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function FloatingMarketRefreshButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;
  const updated = searchParams.get("updated") === "1";
  const fetchedAt = formatTorontoMinute(new Date());

  return (
    <form
      action={refreshMarketDataForPage}
      className="fixed right-5 top-1/2 z-50 w-36 -translate-y-1/2 rounded-md border border-cyan-200 bg-cyan-50/95 p-2 text-center shadow-xl shadow-cyan-900/10 backdrop-blur print:hidden"
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <PendingSubmitButton
        idleLabel="更新"
        pendingLabel="更新中..."
        icon="refresh"
        variant="secondary"
        size="sm"
        className="w-full justify-center border-cyan-300 bg-white text-cyan-800 hover:bg-cyan-100"
      />
      <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-cyan-700">
        <RefreshCw className="h-3 w-3" />
        <span>{fetchedAt}</span>
      </div>
      {updated ? <p className="mt-1 text-[11px] font-medium text-green-700">已重新抓取</p> : null}
    </form>
  );
}
