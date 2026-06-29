import { NextResponse } from "next/server";
import { evaluateOutcomes } from "@/lib/performance/evaluate-outcomes";
import { updateInfluencePoints } from "@/lib/performance/influence-points";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登入。" }, { status: 401 });
  }

  try {
    const result = await evaluateOutcomes(user.id);
    await updateInfluencePoints(user.id);

    return NextResponse.json({
      evaluated: result.evaluated,
      skipped: result.skipped,
      message: "績效更新完成。"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "績效更新失敗。" },
      { status: 500 }
    );
  }
}
