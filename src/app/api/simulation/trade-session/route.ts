import { NextResponse } from "next/server";
import { runTradeForUser } from "@/lib/simulation/run-trade";
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
  const messages: string[] = [];

  try {
    for (const market of ["US", "TW"] as const) {
      const message = await runTradeForUser(supabase, user.id, market, {
        bypassHoursCheck: false
      });
      messages.push(message);
    }
    return NextResponse.json({ message: messages.join(" ") || "今日交易完成。" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "模擬交易失敗。" },
      { status: 500 }
    );
  }
}
