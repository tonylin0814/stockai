"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function DismissAlertButton({ alertId }: { alertId: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function dismiss() {
    await fetch(`/api/alerts/${alertId}/read`, { method: "POST" });
    setDismissed(true);
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      className="shrink-0 text-slate-400 hover:text-slate-600"
      aria-label="關閉提醒"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
