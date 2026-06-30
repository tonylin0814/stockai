import { NextResponse } from "next/server";
import { assertAnalysisBudget } from "@/lib/analysis/cost-guard";
import { getFamilyId } from "@/lib/analysis/pipeline/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 20;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isStaleRunningRun(startedAt: unknown) {
  if (!startedAt) return false;
  const started = new Date(String(startedAt)).getTime();
  return Number.isFinite(started) && Date.now() - started > 10 * 60 * 1000;
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
  const runDate = todayIsoDate();

  try {
    await assertAnalysisBudget({ userId: user.id });

    const { data: existingRun } = await supabase
      .from("daily_runs")
      .select("id, status, started_at")
      .eq("user_id", user.id)
      .eq("run_date", runDate)
      .in("status", ["running", "completed"])
      .maybeSingle();

    if (existingRun) {
      if (String(existingRun.status) === "completed") {
        return NextResponse.json(
          { error: "今日分析已執行或正在執行中。" },
          { status: 409 }
        );
      }

      if (!isStaleRunningRun((existingRun as { started_at?: string | null }).started_at)) {
        return NextResponse.json(
          { status: "running", dailyRunId: existingRun.id },
          { status: 202 }
        );
      }

      await supabase
        .from("daily_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          data_package: {
            recoveryReason: "先前每日分析逾時或中斷，已自動標記為失敗。"
          }
        })
        .eq("id", existingRun.id)
        .eq("user_id", user.id);
    }

    const familyId = await getFamilyId(user.id);
    const { data: dailyRun, error: insertError } = await supabase
      .from("daily_runs")
      .insert({
        user_id: user.id,
        family_id: familyId,
        run_date: runDate,
        status: "running",
        started_at: new Date().toISOString(),
        data_package: {
          pipelineStage: "data_package",
          stageMessage: "正在建立分析資料包。",
          familyId
        }
      })
      .select("id")
      .single();

    if (insertError || !dailyRun) {
      throw new Error(insertError?.message ?? "無法建立每日分析紀錄。");
    }

    return NextResponse.json({
      status: "running",
      dailyRunId: (dailyRun as { id: string }).id
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "每日分析執行失敗。" },
      { status: 500 }
    );
  }
}
