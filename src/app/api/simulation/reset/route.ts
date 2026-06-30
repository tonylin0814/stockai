import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入。" }, { status: 401 });

  const supabase = createSupabaseServiceClient();

  try {
    const { data: portfolios } = await supabase
      .from("sim_portfolios")
      .select("id")
      .eq("user_id", user.id);
    const portfolioIds = (portfolios ?? []).map((portfolio: { id: string }) => portfolio.id);

    if (portfolioIds.length) {
      await supabase.from("sim_positions").delete().in("portfolio_id", portfolioIds);
      await supabase.from("sim_trades").delete().in("portfolio_id", portfolioIds);
    }

    await Promise.all([
      supabase
        .from("sim_portfolios")
        .update({ current_cash: 10000, reset_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("market", "US"),
      supabase
        .from("sim_portfolios")
        .update({ current_cash: 300000, reset_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("market", "TW")
    ]);

    return NextResponse.json({ message: "模擬交易已重置。" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "重置失敗。" },
      { status: 500 }
    );
  }
}
