import { NextResponse } from "next/server";
import { runWeeklyEvalForUser } from "@/lib/simulation/run-weekly";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入。" }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  try {
    const message = await runWeeklyEvalForUser(supabase, user.id);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "週評估失敗。" },
      { status: 500 }
    );
  }
}
