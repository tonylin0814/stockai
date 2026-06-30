"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/analysis/daily", label: "今日分析" },
  { href: "/analysis/report", label: "CIO 報告" }
];

export function AnalysisTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-950"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
