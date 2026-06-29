"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

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

    try {
      const response = await fetch(`/api/alerts/${alertId}/read`, { method: "POST" });
      if (response.ok) {
        onDismiss(alertId);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={loading}
      className="shrink-0 text-slate-400 hover:text-slate-600 disabled:opacity-50"
      aria-label={loading ? "關閉提醒中" : "關閉提醒"}
      title={loading ? "關閉提醒中" : "關閉提醒"}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
    </button>
  );
}
