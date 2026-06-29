import { NextResponse, type NextRequest } from "next/server";
import { buildMissionDataPackage } from "@/lib/analysis/mission-package";
import { runSingleStockMission } from "@/lib/analysis/pipeline/single-stock";
import { runWebResearch } from "@/lib/analysis/web-research";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "未知錯誤";
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { holdingId: string } }
) {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user }
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登入。" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: holding, error: holdingError } = await supabase
    .from("portfolio_holdings")
    .select("id, shares, securities(symbol, market, name)")
    .eq("id", params.holdingId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (holdingError || !holding) {
    return NextResponse.json({ error: "找不到持股。" }, { status: 404 });
  }

  const security = (holding as unknown as {
    securities: { symbol: string; market: string; name: string } | null;
  }).securities;

  if (!security) {
    return NextResponse.json({ error: "找不到股票資料。" }, { status: 404 });
  }

  let missionId: string | null = null;

  try {
    const title = `快速分析：${security.symbol} ${security.name}`;
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .insert({
        user_id: user.id,
        title,
        mission_type: "single_stock",
        original_question: `請分析 ${security.symbol}（${security.name}）目前的投資價值與建議。`,
        related_symbols: [security.symbol],
        status: "running",
        started_at: new Date().toISOString(),
        data_package: { relatedMarket: security.market }
      })
      .select("id")
      .single();

    if (missionError || !mission) {
      throw new Error(missionError?.message ?? "任務建立失敗。");
    }

    missionId = (mission as { id: string }).id;
    const dataPackage = await buildMissionDataPackage(user.id, missionId);

    if (security.market === "US") {
      dataPackage.webResearch = await runWebResearch({
        symbols: [{ symbol: security.symbol, name: security.name, market: "US" }]
      });
    }

    await runSingleStockMission({
      userId: user.id,
      missionId,
      dataPackage
    });

    await supabase
      .from("missions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", missionId)
      .eq("user_id", user.id);

    return NextResponse.json({ missionId });
  } catch (error) {
    const message = errorMessage(error);

    if (missionId) {
      await supabase
        .from("missions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message
        })
        .eq("id", missionId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
