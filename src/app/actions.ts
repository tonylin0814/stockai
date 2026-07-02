"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().transform((value) => value || null);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((value) => value || null);
const marketSchema = z.enum(["TW", "US"]);
const securityTypeSchema = z.enum(["stock", "etf"]);
const currencySchema = z.enum(["TWD", "USD"]);
const transactionTypeSchema = z.enum(["buy", "sell"]);

type PortfolioTransactionInput = {
  id?: string;
  transaction_type: "buy" | "sell";
  trade_date: string;
  shares: number;
  price: number;
  currency: "TWD" | "USD";
  fees: number;
  notes: string | null;
};

type PortfolioTransactionRow = PortfolioTransactionInput & {
  id: string;
};

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
    .from("stocks_securities")
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

function calculatePosition(transactions: PortfolioTransactionInput[]) {
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = a.trade_date.localeCompare(b.trade_date);
    if (dateDiff !== 0) return dateDiff;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
  let shares = 0;
  let costBasis = 0;

  for (const transaction of sorted) {
    if (transaction.transaction_type === "buy") {
      shares += transaction.shares;
      costBasis += transaction.shares * transaction.price + transaction.fees;
      continue;
    }

    if (transaction.shares > shares + 0.000001) {
      throw new Error("賣出股數不能超過目前持股。");
    }

    const averageCost = shares > 0 ? costBasis / shares : 0;
    shares -= transaction.shares;
    costBasis -= averageCost * transaction.shares;

    if (shares < 0.000001) {
      shares = 0;
      costBasis = 0;
    }
  }

  return {
    shares,
    averageCost: shares > 0 ? costBasis / shares : 0
  };
}

async function loadHoldingForTransaction(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  holdingId: string
) {
  const { data, error } = await supabase
    .from("stocks_portfolio_holdings")
    .select("id, user_id, family_id, security_id, cost_currency")
    .eq("id", holdingId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "找不到持股。");
  }

  return data as {
    id: string;
    user_id: string;
    family_id: string | null;
    security_id: string;
    cost_currency: "TWD" | "USD";
  };
}

async function loadPortfolioTransactions(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  holdingId: string
) {
  const { data, error } = await supabase
    .from("stocks_portfolio_transactions")
    .select("id, transaction_type, trade_date, shares, price, currency, fees, notes")
    .eq("user_id", userId)
    .eq("holding_id", holdingId)
    .order("trade_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as PortfolioTransactionRow[];
}

async function updateHoldingFromTransactions(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  holdingId: string,
  transactions: PortfolioTransactionInput[]
) {
  const position = calculatePosition(transactions);
  const { error } = await supabase
    .from("stocks_portfolio_holdings")
    .update({
      shares: position.shares,
      average_cost: position.averageCost,
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq("id", holdingId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

function parsePortfolioTransactionForm(formData: FormData) {
  const schema = z.object({
    transaction_type: transactionTypeSchema,
    trade_date: requiredText,
    shares: z.number().positive(),
    price: z.number().nonnegative(),
    currency: currencySchema,
    fees: z.number().nonnegative(),
    notes: optionalText
  });

  return schema.parse({
    transaction_type: getString(formData, "transaction_type"),
    trade_date: getString(formData, "trade_date"),
    shares: getNumber(formData, "shares"),
    price: getNumber(formData, "price"),
    currency: getString(formData, "currency"),
    fees: getString(formData, "fees") ? getNumber(formData, "fees") : 0,
    notes: getString(formData, "notes")
  });
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

  const { error: profileError } = await supabase.from("stocks_profiles").upsert({
    id: data.user.id,
    display_name: input.data.display_name,
    base_currency: "TWD",
    timezone: "Asia/Taipei"
  });

  if (profileError) {
    authErrorRedirect("/register", "帳號已建立，但個人資料建立失敗。請確認是否已關閉信箱驗證。");
  }

  const { error: settingsError } = await supabase.from("stocks_user_settings").upsert(
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

  const { data: holding, error } = await supabase
    .from("stocks_portfolio_holdings")
    .insert({
      user_id: user.id,
      security_id: securityId,
      shares: input.shares,
      average_cost: input.average_cost,
      cost_currency: input.cost_currency,
      strategy: input.strategy,
      notes: input.notes,
      opened_at: input.opened_at,
      is_active: true
    })
    .select("id, family_id")
    .single();

  if (error || !holding) {
    throw new Error(error?.message ?? "無法建立持股。");
  }

  if (input.shares > 0) {
    const { error: transactionError } = await supabase
      .from("stocks_portfolio_transactions")
      .insert({
        user_id: user.id,
        family_id: holding.family_id,
        holding_id: holding.id,
        security_id: securityId,
        transaction_type: "buy",
        trade_date: input.opened_at ?? new Date().toISOString().slice(0, 10),
        shares: input.shares,
        price: input.average_cost,
        currency: input.cost_currency,
        fees: 0,
        notes: input.notes ? `初始持股：${input.notes}` : "初始持股"
      });

    if (transactionError) {
      throw new Error(transactionError.message);
    }
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
    .from("stocks_portfolio_holdings")
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
  const { supabase, user } = await requireUser();
  const id = requiredText.parse(getString(formData, "id"));

  const { error } = await supabase
    .from("stocks_portfolio_holdings")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/portfolio");
}

export async function createPortfolioTransaction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const holdingId = requiredText.parse(getString(formData, "holding_id"));
  const holding = await loadHoldingForTransaction(supabase, user.id, holdingId);
  const input = parsePortfolioTransactionForm(formData);
  const existingTransactions = await loadPortfolioTransactions(supabase, user.id, holdingId);
  const proposedTransactions = [...existingTransactions, input];
  calculatePosition(proposedTransactions);

  const { error } = await supabase.from("stocks_portfolio_transactions").insert({
    user_id: user.id,
    family_id: holding.family_id,
    holding_id: holding.id,
    security_id: holding.security_id,
    transaction_type: input.transaction_type,
    trade_date: input.trade_date,
    shares: input.shares,
    price: input.price,
    currency: input.currency,
    fees: input.fees,
    notes: input.notes
  });

  if (error) {
    throw new Error(error.message);
  }

  await updateHoldingFromTransactions(supabase, user.id, holdingId, proposedTransactions);
  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/${holdingId}`);
}

export async function updatePortfolioTransaction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const holdingId = requiredText.parse(getString(formData, "holding_id"));
  const id = requiredText.parse(getString(formData, "id"));
  await loadHoldingForTransaction(supabase, user.id, holdingId);
  const input = parsePortfolioTransactionForm(formData);
  const existingTransactions = await loadPortfolioTransactions(supabase, user.id, holdingId);
  const proposedTransactions = existingTransactions.map((transaction) =>
    transaction.id === id ? { ...input, id } : transaction
  );

  if (!existingTransactions.some((transaction) => transaction.id === id)) {
    throw new Error("找不到交易紀錄。");
  }

  calculatePosition(proposedTransactions);

  const { error } = await supabase
    .from("stocks_portfolio_transactions")
    .update({
      transaction_type: input.transaction_type,
      trade_date: input.trade_date,
      shares: input.shares,
      price: input.price,
      currency: input.currency,
      fees: input.fees,
      notes: input.notes,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("holding_id", holdingId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  await updateHoldingFromTransactions(supabase, user.id, holdingId, proposedTransactions);
  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/${holdingId}`);
}

export async function deletePortfolioTransaction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const holdingId = requiredText.parse(getString(formData, "holding_id"));
  const id = requiredText.parse(getString(formData, "id"));
  await loadHoldingForTransaction(supabase, user.id, holdingId);
  const existingTransactions = await loadPortfolioTransactions(supabase, user.id, holdingId);
  const proposedTransactions = existingTransactions.filter((transaction) => transaction.id !== id);

  if (proposedTransactions.length === existingTransactions.length) {
    throw new Error("找不到交易紀錄。");
  }

  calculatePosition(proposedTransactions);

  const { error } = await supabase
    .from("stocks_portfolio_transactions")
    .delete()
    .eq("id", id)
    .eq("holding_id", holdingId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  await updateHoldingFromTransactions(supabase, user.id, holdingId, proposedTransactions);
  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/${holdingId}`);
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

  const { error } = await supabase.from("stocks_watchlist_items").insert({
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
    .from("stocks_watchlist_items")
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
  const { supabase, user } = await requireUser();
  const id = requiredText.parse(getString(formData, "id"));

  const { error } = await supabase
    .from("stocks_watchlist_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/watchlist");
}

export async function addScanPickToWatchlist(formData: FormData) {
  const { supabase, user } = await requireUser();
  const schema = z.object({
    pickId: z.string().uuid(),
    symbol: requiredText.transform((value) => value.toUpperCase()),
    name: requiredText
  });
  const input = schema.parse({
    pickId: getString(formData, "pickId"),
    symbol: getString(formData, "symbol"),
    name: getString(formData, "name")
  });

  const { data: security, error: securityError } = await supabase
    .from("stocks_securities")
    .upsert(
      {
        symbol: input.symbol,
        market: "TW",
        name: input.name,
        security_type: "stock",
        currency: "TWD"
      },
      { onConflict: "symbol,market" }
    )
    .select("id")
    .single();

  if (securityError || !security) {
    throw new Error(securityError?.message ?? "無法建立股票資料");
  }

  const securityId = (security as { id: string }).id;
  const { data: existing } = await supabase
    .from("stocks_watchlist_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("security_id", securityId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("stocks_watchlist_items").insert({
      user_id: user.id,
      security_id: securityId,
      reason: "每日台股掃描推薦",
      status: "觀察中",
      visibility: "private"
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: updateError } = await supabase
    .from("stocks_daily_scan_picks")
    .update({ added_to_watchlist: true })
    .eq("id", input.pickId)
    .eq("user_id", user.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/watchlist");
}

export async function addMarketPickToWatchlist(formData: FormData) {
  const { supabase, user } = await requireUser();
  const schema = z.object({
    symbol: requiredText.transform((value) => value.toUpperCase()),
    market: marketSchema,
    name: requiredText,
    targetPrice: z.coerce.number().positive().nullable(),
    reason: optionalText
  });
  const input = schema.parse({
    symbol: getString(formData, "symbol"),
    market: getString(formData, "market"),
    name: getString(formData, "name"),
    targetPrice: getString(formData, "targetPrice") ? getNumber(formData, "targetPrice") : null,
    reason: getString(formData, "reason")
  });
  const { data: security, error: securityError } = await supabase
    .from("stocks_securities")
    .upsert(
      {
        symbol: input.symbol,
        market: input.market,
        name: input.name,
        security_type: "stock",
        currency: input.market === "TW" ? "TWD" : "USD"
      },
      { onConflict: "symbol,market" }
    )
    .select("id")
    .single();

  if (securityError || !security) {
    throw new Error(securityError?.message ?? "無法建立股票資料");
  }

  const securityId = (security as { id: string }).id;
  const { data: existing } = await supabase
    .from("stocks_watchlist_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("security_id", securityId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("stocks_watchlist_items").insert({
      user_id: user.id,
      security_id: securityId,
      reason: input.reason ?? "手動加入關注清單",
      target_buy_price: input.targetPrice,
      status: "觀察中",
      visibility: "private"
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/watchlist");
}

export async function createMission(formData: FormData) {
  throw new Error("AI analysis has been removed.");
}

export async function cancelMission(formData: FormData) {
  throw new Error("AI analysis has been removed.");
}

export async function deleteMission(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().parse(getString(formData, "id"));

  const { error } = await supabase
    .from("stocks_missions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/missions");
}

export async function updateMissionAssociations(formData: FormData) {
  const { supabase, user } = await requireUser();
  const schema = z.object({
    missionId: z.string().uuid(),
    portfolioHoldingId: optionalUuid,
    watchlistItemId: optionalUuid
  });
  const input = schema.parse({
    missionId: getString(formData, "missionId"),
    portfolioHoldingId: getString(formData, "portfolioHoldingId"),
    watchlistItemId: getString(formData, "watchlistItemId")
  });

  const { data: mission, error: missionError } = await supabase
    .from("stocks_missions")
    .select("id")
    .eq("id", input.missionId)
    .eq("user_id", user.id)
    .single();

  if (missionError || !mission) {
    throw new Error(missionError?.message ?? "找不到任務。");
  }

  const inserts: Array<{
    user_id: string;
    mission_id: string;
    security_id: string;
    portfolio_holding_id?: string;
    watchlist_item_id?: string;
    link_type: "portfolio" | "watchlist";
  }> = [];

  if (input.portfolioHoldingId) {
    const { data: holding, error } = await supabase
      .from("stocks_portfolio_holdings")
      .select("id, security_id")
      .eq("id", input.portfolioHoldingId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (error || !holding?.security_id) {
      throw new Error(error?.message ?? "找不到可關聯的投資組合股票。");
    }

    inserts.push({
      user_id: user.id,
      mission_id: input.missionId,
      security_id: holding.security_id,
      portfolio_holding_id: holding.id,
      link_type: "portfolio"
    });
  }

  if (input.watchlistItemId) {
    const { data: watchlistItem, error } = await supabase
      .from("stocks_watchlist_items")
      .select("id, security_id")
      .eq("id", input.watchlistItemId)
      .eq("user_id", user.id)
      .single();

    if (error || !watchlistItem?.security_id) {
      throw new Error(error?.message ?? "找不到可關聯的關注清單股票。");
    }

    inserts.push({
      user_id: user.id,
      mission_id: input.missionId,
      security_id: watchlistItem.security_id,
      watchlist_item_id: watchlistItem.id,
      link_type: "watchlist"
    });
  }

  const { error: deleteError } = await supabase
    .from("stocks_mission_links")
    .delete()
    .eq("user_id", user.id)
    .eq("mission_id", input.missionId)
    .in("link_type", ["portfolio", "watchlist"]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("stocks_mission_links").insert(inserts);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  revalidatePath("/missions");
  revalidatePath(`/missions/${input.missionId}`);
  revalidatePath("/portfolio");
  revalidatePath("/watchlist");
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
    .from("stocks_securities")
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

  const { error } = await supabase.from("stocks_paper_trades").insert({
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
    .from("stocks_paper_trades")
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
    .from("stocks_paper_trades")
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
    .from("stocks_recommendations")
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
    .from("stocks_user_settings")
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
  redirect(`/portfolio/${holdingId}?updated=1`);
}

export async function refreshMarketOverview() {
  revalidatePath("/home");
  redirect("/home?updated=1");
}

export async function refreshMarketDataForPage(formData: FormData) {
  const returnTo = getString(formData, "returnTo") || "/home";
  const url = new URL(returnTo, "https://local.app");
  const pathname =
    url.origin === "https://local.app" && url.pathname.startsWith("/")
      ? url.pathname
      : "/home";

  revalidatePath(pathname);
  url.searchParams.set("updated", "1");
  redirect(`${pathname}${url.search}`);
}
