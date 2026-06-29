"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function DismissAlertButton({
  alertId,
  onDismiss
}: {
  alertId: string;
  onDismiss: (alertId: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function dismiss() {
    if (loading) return;
    setLoading(true);

    const response = await fetch(`/api/alerts/${alertId}/read`, { method: "POST" });
    if (response.ok) {
      onDismiss(alertId);
    } else {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={loading}
      className="shrink-0 text-slate-400 hover:text-slate-600 disabled:opacity-50"
      aria-label="關閉提醒"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
