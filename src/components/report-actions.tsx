"use client";

import { Download, ExternalLink, UploadCloud } from "lucide-react";
import { useState } from "react";

export function ReportActions({ runId, runDate }: { runId: string; runDate: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ webUrl: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/onedrive/${runId}`, { method: "POST" });
      let data: { success?: boolean; webUrl?: string; filename?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        setError(text.slice(0, 200) || `伺服器錯誤 (HTTP ${res.status})`);
        return;
      }

      if (!res.ok) {
        setError(data.error || `伺服器錯誤 (HTTP ${res.status})`);
        return;
      }

      if (data.success && data.webUrl && data.filename) {
        setUploadResult({ webUrl: data.webUrl, filename: data.filename });
      } else {
        setError(data.error ?? "上傳失敗");
      }
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={`/api/report/pdf/${runId}`}
        download={`StocksAI-CIO-Report-${runDate}.pdf`}
        className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800"
      >
        <Download className="h-4 w-4" />
        下載 PDF
      </a>

      {!uploadResult ? (
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <UploadCloud className="h-4 w-4" />
          {uploading ? "上傳中..." : "上傳到 OneDrive"}
        </button>
      ) : (
        <a
          href={uploadResult.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
        >
          <ExternalLink className="h-4 w-4" />
          在 OneDrive 開啟
        </a>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
