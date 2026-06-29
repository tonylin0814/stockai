import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stocks AI",
  description: "Private investment decision platform"
};

const navLinks = [
  { href: "/dashboard", label: "總覽" },
  { href: "/portfolio", label: "投資組合" },
  { href: "/watchlist", label: "關注清單" },
  { href: "/markets", label: "市場" },
  { href: "/analysis/daily", label: "分析" },
  { href: "/performance", label: "績效" },
  { href: "/missions", label: "任務" },
  { href: "/paper-trades", label: "模擬交易" },
  { href: "/reports", label: "報告" },
  { href: "/settings", label: "設定" }
];

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <html lang="zh-Hant">
      <body>
        {user ? (
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <Link href="/dashboard" className="font-semibold text-slate-950">
                台美股投資決策系統
              </Link>
              <nav className="flex flex-wrap items-center gap-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    {link.label}
                  </Link>
                ))}
                <form action={signOut}>
                  <Button type="submit" variant="ghost" size="sm">
                    <LogOut className="h-4 w-4" />
                    登出
                  </Button>
                </form>
              </nav>
            </div>
          </header>
        ) : null}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
