"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AnalysisReportItem = {
  label: string;
  status: "completed" | "running" | "failed" | "pending";
  detail: string;
};

export type AnalysisAgentLogItem = {
  label: string;
  status: "completed" | "failed" | "running";
  detail: string;
};

type AnalysisRunReportDialogProps = {
  autoOpen: boolean;
  runId: string | null;
  status: string | null;
  title: string;
  summary: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  items: AnalysisReportItem[];
  agentLogs: AnalysisAgentLogItem[];
};

function statusLabel(status: AnalysisReportItem["status"] | AnalysisAgentLogItem["status"]) {
  if (status === "completed") return "完成";
  if (status === "running") return "執行中";
  if (status === "failed") return "失敗";
  return "等待中";
}

function StatusIcon({ status }: { status: AnalysisReportItem["status"] | AnalysisAgentLogItem["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-600" />;
  return <Clock className="h-4 w-4 text-slate-400" />;
}

export function AnalysisRunReportDialog({
  autoOpen,
  runId,
  status,
  title,
  summary,
  startedAt,
  completedAt,
  updatedAt,
  items,
  agentLogs
}: AnalysisRunReportDialogProps) {
  const storageKey = runId ? `analysis-report-seen:${runId}:${status ?? "none"}` : null;
  const [open, setOpen] = useState(false);
  const failedCount = useMemo(
    () => items.filter((item) => item.status === "failed").length + agentLogs.filter((item) => item.status === "failed").length,
    [agentLogs, items]
  );

  useEffect(() => {
    if (!autoOpen || !runId || !storageKey) return;
    const alreadySeen = window.sessionStorage.getItem(storageKey);
    if (!alreadySeen) {
      setOpen(true);
      window.sessionStorage.setItem(storageKey, "1");
    }
  }, [autoOpen, runId, storageKey]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        查看分析報告
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-md bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
                <p className="mt-1 text-sm text-slate-600">{summary}</p>
                <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-3">
                  <p>開始：{startedAt ?? "—"}</p>
                  <p>結束：{completedAt ?? "—"}</p>
                  <p>更新：{updatedAt ?? "—"}</p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="關閉">
                <XCircle className="h-4 w-4" />
              </Button>
            </div>

            {failedCount > 0 ? (
              <div className="mt-4 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>這次分析有 {failedCount} 個項目失敗。請查看下方失敗項目與 API 用量頁錯誤。</p>
              </div>
            ) : null}

            <div className="mt-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-950">分析項目</h3>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {items.map((item) => (
                  <div key={item.label} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[180px_90px_1fr]">
                    <div className="font-medium text-slate-950">{item.label}</div>
                    <div className="inline-flex items-center gap-2 text-slate-700">
                      <StatusIcon status={item.status} />
                      {statusLabel(item.status)}
                    </div>
                    <div className="text-slate-600">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-950">模型呼叫紀錄</h3>
              {agentLogs.length === 0 ? (
                <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">尚無模型呼叫紀錄。</p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {agentLogs.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="grid gap-2 px-3 py-3 text-xs md:grid-cols-[180px_90px_1fr]">
                      <div className="font-medium text-slate-950">{item.label}</div>
                      <div className="inline-flex items-center gap-2 text-slate-700">
                        <StatusIcon status={item.status} />
                        {statusLabel(item.status)}
                      </div>
                      <div className="break-words text-slate-600">{item.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
