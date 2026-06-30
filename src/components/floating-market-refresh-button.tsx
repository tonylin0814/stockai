"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { refreshMarketDataForPage } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function FloatingMarketRefreshButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  return (
    <form
      action={refreshMarketDataForPage}
      className="fixed right-5 top-1/2 z-50 -translate-y-1/2 print:hidden"
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <PendingSubmitButton
        idleLabel="更新市場資料"
        pendingLabel="更新中..."
        icon="refresh"
        className="shadow-lg"
      />
    </form>
  );
}
