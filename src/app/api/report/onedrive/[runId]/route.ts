import { NextResponse, type NextRequest } from "next/server";
import { loadReportByRunId } from "@/lib/report/data";
import { uploadToOneDrive } from "@/lib/report/onedrive";
import { generateReportPdf } from "@/lib/report/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const loaded = await loadReportByRunId(supabase, user.id, params.runId);
    if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const pdfBuffer = await generateReportPdf(loaded.reportData);
    const filename = `StocksAI-CIO-Report-${loaded.latestRun.run_date}.pdf`;
    const { webUrl } = await uploadToOneDrive({ filename, pdfBuffer });

    return NextResponse.json({ success: true, webUrl, filename });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
