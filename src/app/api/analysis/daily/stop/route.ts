import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 10;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登入。" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: run } = await supabase
    .from("stocks_daily_runs")
    .select("id, data_package")
    .eq("user_id", user.id)
    .eq("run_date", todayIsoDate())
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ status: "not_running" });
  }

  const dataPackage =
    run.data_package && typeof run.data_package === "object" && !Array.isArray(run.data_package)
      ? (run.data_package as Record<string, unknown>)
      : {};
  const stoppedAt = new Date().toISOString();

  const { error } = await supabase
    .from("stocks_daily_runs")
    .update({
      status: "failed",
      completed_at: stoppedAt,
      data_package: {
        ...dataPackage,
        pipelineStage: "failed",
        error: "手動停止：使用者停止分析，避免繼續產生 API 費用。",
        stoppedAt
      }
    })
    .eq("id", run.id)
    .eq("user_id", user.id)
    .eq("status", "running");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "stopped", dailyRunId: run.id, stoppedAt });
}
