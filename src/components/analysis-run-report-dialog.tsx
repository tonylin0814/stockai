"use client";

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

export function AnalysisRunReportDialog() {
  return null;
}
