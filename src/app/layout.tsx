import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { signOutToIndex } from "@/app/account-actions";
import { FloatingMarketRefreshButton } from "@/components/floating-market-refresh-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "RH 台美股分析",
  description: "RH 台美股投資決策系統",
  icons: {
    icon: [{ url: "/brand/rh-favicon.png?v=2", type: "image/png" }],
    shortcut: [{ url: "/brand/rh-favicon.png?v=2", type: "image/png" }],
    apple: [{ url: "/brand/rh-favicon.png?v=2", type: "image/png" }]
  }
};

const navLinks = [
  { href: "/home", label: "首頁" },
  { href: "/markets", label: "市場分析" },
  { href: "/portfolio", label: "我的投資" },
  { href: "/watchlist", label: "關注清單" },
  { href: "/missions", label: "分析個股" },
  { href: "/settings", label: "設定" },
];

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;
  let nickname = "";

  if (user) {
    const { data: profile } = await supabase
      .from("stocks_profiles")
      .select("nickname, display_name")
      .eq("id", user.id)
      .maybeSingle();
    nickname =
      String(profile?.nickname ?? profile?.display_name ?? "").trim() ||
      String(user.email ?? "").split("@")[0] ||
      "User";
  }

  return (
    <html lang="zh-Hant">
      <body>
        {user ? (
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <Link href="/home" className="flex items-center gap-3 text-slate-950">
                <Image
                  src="/brand/rh-logo-mark.png"
                  alt="Rock Hill Innovation"
                  width={72}
                  height={54}
                  className="h-10 w-auto"
                />
                <span className="hidden text-base font-semibold text-slate-600 lg:inline">
                  台美股投資決策系統
                </span>
              </Link>
              <nav className="flex flex-wrap items-center gap-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-3 py-2 text-base text-slate-800 hover:bg-slate-100"
                  >
                    {link.label}
                  </Link>
                ))}
                <span className="px-2 py-2 text-base font-medium text-slate-700">
                  Hi! {nickname}
                </span>
                <form action={signOutToIndex}>
                  <PendingSubmitButton
                    idleLabel="登出"
                    pendingLabel="登出中..."
                    icon="logout"
                    variant="ghost"
                    size="sm"
                  />
                </form>
              </nav>
            </div>
          </header>
        ) : null}
        <main className="mx-auto max-w-7xl px-5 py-7">{children}</main>
        {user ? (
          <Suspense fallback={null}>
            <FloatingMarketRefreshButton />
          </Suspense>
        ) : null}
      </body>
    </html>
  );
}
