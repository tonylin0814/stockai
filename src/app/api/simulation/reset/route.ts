import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

async function requireSuccess(
  resultPromise: PromiseLike<{ error: { message?: string } | null }>
) {
  const result = await resultPromise;
  if (result.error) {
    throw new Error(result.error.message ?? "資料庫操作失敗。");
  }
}

export async function POST() {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "未登入。" }, { status: 401 });

  const supabase = createSupabaseServiceClient();

  try {
    const { data: portfolios } = await supabase
      .from("stocks_sim_portfolios")
      .select("id")
      .eq("user_id", user.id);
    const portfolioIds = (portfolios ?? []).map((portfolio: { id: string }) => portfolio.id);

    if (portfolioIds.length) {
      await requireSuccess(supabase.from("stocks_sim_trades").delete().in("portfolio_id", portfolioIds));
      await requireSuccess(supabase.from("stocks_sim_positions").delete().in("portfolio_id", portfolioIds));
    }

    await Promise.all([
      requireSuccess(supabase.from("stocks_sim_predictions").delete().eq("user_id", user.id)),
      requireSuccess(supabase.from("stocks_sim_daily_reports").delete().eq("user_id", user.id)),
      requireSuccess(supabase.from("stocks_sim_weekly_evals").delete().eq("user_id", user.id)),
      requireSuccess(supabase.from("stocks_sim_scores").delete().eq("user_id", user.id))
    ]);

    await Promise.all([
      requireSuccess(
        supabase
          .from("stocks_sim_portfolios")
          .update({ current_cash: 10000, reset_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("market", "US")
      ),
      requireSuccess(
        supabase
          .from("stocks_sim_portfolios")
          .update({ current_cash: 300000, reset_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("market", "TW")
      )
    ]);

    return NextResponse.json({ message: "模擬交易已重置。" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "重置失敗。" },
      { status: 500 }
    );
  }
}
