"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function authErrorRedirect(message: string): never {
  redirect(`/index?error=${encodeURIComponent(message)}`);
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

const usernameSchema = z
  .string()
  .trim()
  .min(1, "請輸入用戶名稱。")
  .regex(/^\S+$/, "用戶名稱不能有空格。")
  .transform(normalizeUsername);

export async function signInWithUsername(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const username = usernameSchema.safeParse(getString(formData, "username"));
  const password = getString(formData, "password");

  if (!username.success || !password) {
    authErrorRedirect("請輸入用戶名稱與密碼。");
  }

  const { data: resolvedEmail, error: resolveError } = await supabase.rpc("resolve_login_email", {
    login_username: username.data
  });
  const email = typeof resolvedEmail === "string" ? resolvedEmail : "";

  if (resolveError || !email) {
    authErrorRedirect("登入失敗，請確認用戶名稱與密碼。");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    authErrorRedirect("登入失敗，請確認用戶名稱與密碼。");
  }

  redirect("/home");
}

export async function signOutToIndex() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/index");
}

export async function updateAccountProfile(_prev: unknown, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "登入已過期，請重新登入。" };
  }

  const schema = z.object({
    nickname: z.string().trim().min(1, "請輸入我的暱稱。"),
    username: usernameSchema
  });
  const parsed = schema.safeParse({
    nickname: getString(formData, "nickname"),
    username: getString(formData, "username")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "請確認帳號資料。" };
  }

  const { data: existing } = await supabase
    .from("stocks_profiles")
    .select("id")
    .eq("username", parsed.data.username)
    .neq("id", user.id)
    .maybeSingle();

  if (existing) {
    return { error: "這個用戶名稱已被使用。" };
  }

  const { error } = await supabase.from("stocks_profiles").upsert({
    id: user.id,
    nickname: parsed.data.nickname,
    username: parsed.data.username,
    login_email: user.email,
    updated_at: new Date().toISOString()
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    profile: {
      nickname: parsed.data.nickname,
      username: parsed.data.username
    }
  };
}

export async function updatePasswordAndSignOut(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const password = z.string().min(6).safeParse(getString(formData, "password"));

  if (!password.success) {
    redirect("/settings?passwordError=1");
  }

  const { error } = await supabase.auth.updateUser({ password: password.data });

  if (error) {
    redirect("/settings?passwordError=1");
  }

  await supabase.auth.signOut();
  redirect("/index?passwordChanged=1");
}
