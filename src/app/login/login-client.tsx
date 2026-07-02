"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [error, setError] = useState(searchParams.get("error") ?? "");
  const [pending, setPending] = useState(false);
  const passwordChanged = searchParams.get("passwordChanged") === "1";

  return (
    <div className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-slate-950">登入</h1>
        <p className="text-sm text-slate-600">請使用用戶名稱與密碼進入系統。</p>
      </div>
      {passwordChanged ? (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          密碼已修改，請重新登入。
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError("");

          const formData = new FormData(event.currentTarget);
          const username = normalizeUsername(String(formData.get("username") ?? ""));
          const password = String(formData.get("password") ?? "");

          if (!username || /\s/.test(username) || !password) {
            setError("請輸入用戶名稱與密碼。");
            setPending(false);
            return;
          }

          const { data: resolvedEmail, error: resolveError } = await supabase.rpc(
            "resolve_login_email",
            { login_username: username }
          );
          const email = typeof resolvedEmail === "string" ? resolvedEmail : "";

          if (resolveError || !email) {
            setError("登入失敗，請確認用戶名稱與密碼。");
            setPending(false);
            return;
          }

          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (signInError) {
            setError("登入失敗，請確認用戶名稱與密碼。");
            setPending(false);
            return;
          }

          router.push("/home");
          router.refresh();
        }}
      >
        <FormField label="用戶名稱" htmlFor="username">
          <Input id="username" name="username" required autoComplete="username" />
        </FormField>
        <FormField label="密碼" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </FormField>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "登入中..." : "登入"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        還沒有帳號？{" "}
        <Link href="/register" className="font-medium text-slate-950 underline">
          建立帳號
        </Link>
      </p>
    </div>
  );
}
