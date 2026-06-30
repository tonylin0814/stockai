import { NextResponse, type NextRequest } from "next/server";
import { loadReportByRunId } from "@/lib/report/data";
import { generateReportPdf } from "@/lib/report/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const loaded = await loadReportByRunId(supabase, user.id, params.runId);
  if (!loaded) return new NextResponse("Not found", { status: 404 });

  const pdfBuffer = await generateReportPdf(loaded.reportData);
  const body = pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength
  ) as ArrayBuffer;
  const filename = `StocksAI-CIO-Report-${loaded.latestRun.run_date}.pdf`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
