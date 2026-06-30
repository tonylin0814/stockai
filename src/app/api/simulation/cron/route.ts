import { NextRequest, NextResponse } from "next/server";
import { runReportForUser } from "@/lib/simulation/run-report";
import { runTradeForUser } from "@/lib/simulation/run-trade";
import { runWeeklyEvalForUser } from "@/lib/simulation/run-weekly";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 300;

type Action = "trade-us" | "trade-tw" | "report" | "weekly";

const actions: Action[] = ["trade-us", "trade-tw", "report", "weekly"];

function validateSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  return header === secret;
}

function isAction(value: string | null): value is Action {
  return value !== null && actions.includes(value as Action);
}

export async function POST(request: NextRequest) {
  if (!validateSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (!isAction(action)) {
    return NextResponse.json(
      { error: "Missing or invalid ?action= param. Use: trade-us | trade-tw | report | weekly" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServiceClient();
  const { data: configs, error: configError } = await supabase
    .from("sim_config")
    .select("user_id")
    .eq("is_active", true);

  if (configError) {
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  const userIds = (configs ?? []).map((row: { user_id: string }) => row.user_id);
  if (!userIds.length) {
    return NextResponse.json({ message: "No active simulation users found." });
  }

  const results: string[] = [];

  for (const userId of userIds) {
    try {
      if (action === "trade-us") {
        const message = await runTradeForUser(supabase, userId, "US", {
          bypassHoursCheck: true
        });
        results.push(`User ${userId}: ${message}`);
      } else if (action === "trade-tw") {
        const message = await runTradeForUser(supabase, userId, "TW", {
          bypassHoursCheck: true
        });
        results.push(`User ${userId}: ${message}`);
      } else if (action === "report") {
        const message = await runReportForUser(supabase, userId);
        results.push(`User ${userId}: ${message}`);
      } else if (action === "weekly") {
        const message = await runWeeklyEvalForUser(supabase, userId);
        results.push(`User ${userId}: ${message}`);
      }
    } catch (err) {
      results.push(`User ${userId} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ message: results.join(" | ") });
}
