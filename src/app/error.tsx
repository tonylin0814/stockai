"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-lg font-semibold text-slate-950">發生錯誤</h2>
      <p className="max-w-sm text-sm text-slate-600">
        {error.message || "請重新整理頁面或稍後再試。"}
      </p>
      <Button type="button" onClick={reset} variant="secondary" size="sm">重試</Button>
    </div>
  );
}
