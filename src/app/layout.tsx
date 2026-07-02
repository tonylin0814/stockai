import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { FloatingMarketRefreshButton } from "@/components/floating-market-refresh-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stocks AI",
  description: "Private investment decision platform"
};

const navLinks = [
  { href: "/markets", label: "Home" },
  { href: "/markets/analysis", label: "Markets" },
  { href: "/portfolio", label: "投資組合" },
  { href: "/watchlist", label: "關注清單" },
  { href: "/missions", label: "任務" },
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

  return (
    <html lang="zh-Hant">
      <body>
        {user ? (
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <Link href="/markets" className="flex items-center gap-3 text-slate-950">
                <Image
                  src="/brand/rockhill-logo.png"
                  alt="Rock Hill Innovation"
                  width={260}
                  height={52}
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
                <form action={signOut}>
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
