"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().transform((value) => value || null);
const marketSchema = z.enum(["TW", "US"]);
const securityTypeSchema = z.enum(["stock", "etf"]);
const currencySchema = z.enum(["TWD", "USD"]);

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getNumber(formData: FormData, key: string) {
  const value = Number(getString(formData, key));
  return Number.isFinite(value) ? value : NaN;
}

function getDateOrNull(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value ? value : null;
}

function authErrorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

async function upsertSecurity(formData: FormData) {
  const schema = z.object({
    market: marketSchema,
    symbol: requiredText.transform((value) => value.toUpperCase()),
    name: requiredText,
    security_type: securityTypeSchema
  });

  const input = schema.parse({
    market: getString(formData, "market"),
    symbol: getString(formData, "symbol"),
    name: getString(formData, "name"),
    security_type: getString(formData, "security_type")
  });

  const currency = input.market === "TW" ? "TWD" : "USD";
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("securities")
    .upsert(
      {
        symbol: input.symbol,
        market: input.market,
        name: input.name,
        security_type: input.security_type,
        currency
      },
      { onConflict: "symbol,market" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "無法儲存股票資料");
  }

  return data.id as string;
}

export async function signIn(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const email = getString(formData, "email");
  const password = getString(formData, "password");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    authErrorRedirect("/login", "登入失敗，請確認電子郵件與密碼。");
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const schema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(6),
    display_name: requiredText
  });

  const input = schema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
    display_name: getString(formData, "display_name")
  });

  if (!input.success) {
    authErrorRedirect("/register", "請填寫有效的註冊資料。");
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.data.email,
    password: input.data.password
  });

  if (error || !data.user) {
    authErrorRedirect("/register", "註冊失敗，請稍後再試。");
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: data.user.id,
    display_name: input.data.display_name,
    base_currency: "TWD",
    timezone: "Asia/Taipei"
  });

  if (profileError) {
    authErrorRedirect("/register", "帳號已建立，但個人資料建立失敗。請確認是否已關閉信箱驗證。");
  }

  const { error: settingsError } = await supabase.from("user_settings").upsert(
    {
      user_id: data.user.id,
      max_single_position_pct: 15,
      max_sector_exposure_pct: 35,
      max_market_exposure_pct: 70,
      default_stop_loss_pct: 10,
      min_consensus_level: "strong",
      min_confidence_for_action: 70
    },
    { onConflict: "user_id" }
  );

  if (settingsError) {
    authErrorRedirect("/register", "帳號已建立，但使用者設定建立失敗。");
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createHolding(formData: FormData) {
  const { supabase, user } = await requireUser();
  const securityId = await upsertSecurity(formData);
  const schema = z.object({
    shares: z.number().nonnegative(),
    average_cost: z.number().nonnegative(),
    cost_currency: currencySchema,
    strategy: z.enum(["長期", "波段", "短線", "觀察"]),
    notes: optionalText,
    opened_at: z.string().nullable()
  });

  const input = schema.parse({
    shares: getNumber(formData, "shares"),
    average_cost: getNumber(formData, "average_cost"),
    cost_currency: getString(formData, "cost_currency"),
    strategy: getString(formData, "strategy"),
    notes: getString(formData, "notes"),
    opened_at: getDateOrNull(formData, "opened_at")
  });

  const { error } = await supabase.from("portfolio_holdings").insert({
    user_id: user.id,
    security_id: securityId,
    shares: input.shares,
    average_cost: input.average_cost,
    cost_currency: input.cost_currency,
    strategy: input.strategy,
    notes: input.notes,
    opened_at: input.opened_at,
    is_active: true
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/portfolio");
}

export async function updateHolding(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = requiredText.parse(getString(formData, "id"));
  const securityId = await upsertSecurity(formData);
  const schema = z.object({
    shares: z.number().nonnegative(),
    average_cost: z.number().nonnegative(),
    cost_currency: currencySchema,
    strategy: z.enum(["長期", "波段", "短線", "觀察"]),
    notes: optionalText,
    opened_at: z.string().nullable()
  });

  const input = schema.parse({
    shares: getNumber(formData, "shares"),
    average_cost: getNumber(formData, "average_cost"),
    cost_currency: getString(formData, "cost_currency"),
    strategy: getString(formData, "strategy"),
    notes: getString(formData, "notes"),
    opened_at: getDateOrNull(formData, "opened_at")
  });

  const { error } = await supabase
    .from("portfolio_holdings")
    .update({
      security_id: securityId,
      shares: input.shares,
      average_cost: input.average_cost,
      cost_currency: input.cost_currency,
      strategy: input.strategy,
      notes: input.notes,
      opened_at: input.opened_at,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/portfolio");
}

export async function softDeleteHolding(formData: FormData) {
  const { supabase } = await requireUser();
  const id = requiredText.parse(getString(formData, "id"));

  const { error } = await supabase
    .from("portfolio_holdings")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/portfolio");
}

export async function createWatchlistItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const securityId = await upsertSecurity(formData);
  const schema = z.object({
    visibility: z.enum(["private", "family_shared"]),
    reason: optionalText,
    target_buy_price: z.number().nonnegative().nullable(),
    alert_price: z.number().nonnegative().nullable(),
    status: z.enum(["觀察中", "候選", "暫不考慮"]),
    notes: optionalText
  });

  const input = schema.parse({
    visibility: getString(formData, "visibility"),
    reason: getString(formData, "reason"),
    target_buy_price: getString(formData, "target_buy_price")
      ? getNumber(formData, "target_buy_price")
      : null,
    alert_price: getString(formData, "alert_price")
      ? getNumber(formData, "alert_price")
      : null,
    status: getString(formData, "status"),
    notes: getString(formData, "notes")
  });

  const { error } = await supabase.from("watchlist_items").insert({
    user_id: user.id,
    security_id: securityId,
    visibility: input.visibility,
    reason: input.reason,
    target_buy_price: input.target_buy_price,
    alert_price: input.alert_price,
    status: input.status,
    notes: input.notes
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/watchlist");
}

export async function updateWatchlistItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = requiredText.parse(getString(formData, "id"));
  const securityId = await upsertSecurity(formData);
  const schema = z.object({
    visibility: z.enum(["private", "family_shared"]),
    reason: optionalText,
    target_buy_price: z.number().nonnegative().nullable(),
    alert_price: z.number().nonnegative().nullable(),
    status: z.enum(["觀察中", "候選", "暫不考慮"]),
    notes: optionalText
  });

  const input = schema.parse({
    visibility: getString(formData, "visibility"),
    reason: getString(formData, "reason"),
    target_buy_price: getString(formData, "target_buy_price")
      ? getNumber(formData, "target_buy_price")
      : null,
    alert_price: getString(formData, "alert_price")
      ? getNumber(formData, "alert_price")
      : null,
    status: getString(formData, "status"),
    notes: getString(formData, "notes")
  });

  const { error } = await supabase
    .from("watchlist_items")
    .update({
      security_id: securityId,
      visibility: input.visibility,
      reason: input.reason,
      target_buy_price: input.target_buy_price,
      alert_price: input.alert_price,
      status: input.status,
      notes: input.notes,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/watchlist");
}

export async function deleteWatchlistItem(formData: FormData) {
  const { supabase } = await requireUser();
  const id = requiredText.parse(getString(formData, "id"));

  const { error } = await supabase.from("watchlist_items").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/watchlist");
}

export async function createMission(formData: FormData) {
  const { supabase, user } = await requireUser();
  const schema = z.object({
    title: requiredText,
    original_question: requiredText,
    mission_type: z.enum([
      "single_stock",
      "multi_stock",
      "portfolio_review",
      "watchlist_review",
      "theme",
      "event"
    ]),
    related_symbols: z.string().optional(),
    related_market: z.enum(["", "US", "TW", "both"]).optional()
  });
  const input = schema.parse({
    title: getString(formData, "title"),
    original_question: getString(formData, "original_question"),
    mission_type: getString(formData, "mission_type"),
    related_symbols: getString(formData, "related_symbols"),
    related_market: getString(formData, "related_market")
  });
  const explicitSymbols = (input.related_symbols ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const inferredSymbols = Array.from(
    new Set(
      `${input.title} ${input.original_question}`
        .toUpperCase()
        .match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,3})?\b|\b\d{4}(?:\.TW)?\b/g) ?? []
    )
  ).filter(
    (symbol) =>
      ![
        "US",
        "TW",
        "ETF",
        "AI",
        "BUY",
        "SELL",
        "HOLD",
        "WAIT",
        "OR",
        "AND"
      ].includes(symbol)
  );
  const relatedSymbols = explicitSymbols.length ? explicitSymbols : inferredSymbols;

  const { error } = await supabase.from("missions").insert({
    user_id: user.id,
    title: input.title,
    mission_type: input.mission_type,
    original_question: input.original_question,
    related_symbols: relatedSymbols,
    status: "pending",
    data_package: input.related_market ? { relatedMarket: input.related_market } : null
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/missions");
}

export async function cancelMission(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = requiredText.parse(getString(formData, "id"));

  const { error } = await supabase
    .from("missions")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/missions");
}

const CreatePaperTradeSchema = z.object({
  recommendationId: z.string().uuid().optional(),
  symbol: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  market: z.enum(["US", "TW"]),
  direction: z.enum(["long", "short"]).default("long"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entryPrice: z.coerce.number().positive(),
  shares: z.coerce.number().positive().default(1),
  targetPrice: z.coerce.number().positive().optional(),
  stopLoss: z.coerce.number().positive().optional(),
  notes: z.string().max(500).optional()
});

export async function createPaperTrade(_prev: unknown, formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = CreatePaperTradeSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "請確認模擬交易資料。" };
  }

  const input = parsed.data;
  const { data: security, error: securityError } = await supabase
    .from("securities")
    .upsert(
      {
        symbol: input.symbol,
        market: input.market,
        name: input.symbol,
        security_type: "stock",
        currency: input.market === "TW" ? "TWD" : "USD"
      },
      { onConflict: "symbol,market" }
    )
    .select("id")
    .single();

  if (securityError || !security) {
    return { error: securityError?.message ?? "找不到標的。" };
  }

  const { error } = await supabase.from("paper_trades").insert({
    user_id: user.id,
    recommendation_id: input.recommendationId ?? null,
    security_id: security.id,
    direction: input.direction,
    entry_date: input.entryDate,
    entry_price: input.entryPrice,
    shares: input.shares,
    target_price: input.targetPrice ?? null,
    stop_loss: input.stopLoss ?? null,
    notes: input.notes ?? null
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/paper-trades");
  return { success: true };
}

const ClosePaperTradeSchema = z.object({
  id: z.string().uuid(),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exitPrice: z.coerce.number().positive(),
  status: z.enum(["closed", "target_hit", "stop_hit"])
});

export async function closePaperTrade(_prev: unknown, formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = ClosePaperTradeSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "請確認平倉資料。" };
  }

  const input = parsed.data;
  const { data: trade } = await supabase
    .from("paper_trades")
    .select("entry_price, direction")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .single();

  if (!trade) {
    return { error: "找不到模擬交易。" };
  }

  const current = trade as { entry_price: number; direction: string };
  const returnPct =
    current.direction === "long"
      ? ((input.exitPrice - current.entry_price) / current.entry_price) * 100
      : ((current.entry_price - input.exitPrice) / current.entry_price) * 100;

  const { error } = await supabase
    .from("paper_trades")
    .update({
      exit_date: input.exitDate,
      exit_price: input.exitPrice,
      return_pct: returnPct,
      status: input.status
    })
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/paper-trades");
  return { success: true };
}

const RateRecommendationSchema = z.object({
  id: z.string().uuid(),
  rating: z.enum(["useful", "not_useful", "too_aggressive", "too_conservative", "too_early"]),
  notes: z.string().max(500).optional()
});

export async function rateRecommendation(_prev: unknown, formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = RateRecommendationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "請選擇評價。" };
  }

  const input = parsed.data;
  const { error } = await supabase
    .from("recommendations")
    .update({
      user_rating: input.rating,
      user_notes: input.notes ?? null,
      user_rated_at: new Date().toISOString()
    })
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/performance/history");
  return { success: true };
}

const UpdateUserSettingsSchema = z.object({
  max_single_position_pct: z.coerce.number().min(1).max(100),
  max_sector_exposure_pct: z.coerce.number().min(1).max(100),
  max_market_exposure_pct: z.coerce.number().min(1).max(100),
  default_stop_loss_pct: z.coerce.number().min(1).max(50),
  min_consensus_level: z.enum(["strong", "weak"]),
  min_confidence_for_action: z.coerce.number().min(50).max(100)
});

export async function updateUserSettings(_prev: unknown, formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = UpdateUserSettingsSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "請確認設定範圍。" };
  }

  const { error } = await supabase
    .from("user_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function refreshStockMarketData(holdingId: string) {
  revalidatePath(`/portfolio/${holdingId}`);
  redirect(`/portfolio/${holdingId}`);
}
