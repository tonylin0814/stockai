"use client";

import { useEffect } from "react";

export default function ErrorPage({
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
      {error.digest ? (
        <p className="font-mono text-xs text-slate-400">digest: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        重試
      </button>
    </div>
  );
}
