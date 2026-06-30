# Codex Prompt 40 — CIO 報告頁、PDF 生成、OneDrive 上傳

## 前置條件

1. Header 圖片已放於 `public/PDF Header.png`（用於 PDF 封面與每頁頁眉的橫幅圖片）
2. 以下環境變數**已由用戶加入 Vercel Environment Variables**，無需再設定。Codex 只需從 `process.env` 讀取，**絕對不要將值寫入程式碼**：

```env
MICROSOFT_CLIENT_ID
MICROSOFT_TENANT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_DRIVE_ID
```

只需更新 `.env.example`（加入空白占位，供未來開發者參考）：

```env
# Microsoft Graph / OneDrive (for PDF upload to OneDrive)
MICROSOFT_CLIENT_ID=
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_DRIVE_ID=
```

---

## 安裝套件

```bash
npm install @react-pdf/renderer
npm install --save-dev @types/react-pdf
```

---

## Part 1 — Analysis 區域加 Tab 導航

### 新增 `src/app/analysis/layout.tsx`

```tsx
import Link from "next/link";

const tabs = [
  { href: "/analysis/daily", label: "今日分析" },
  { href: "/analysis/report", label: "CIO 報告" }
];

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-950 border-b-2 border-transparent hover:border-slate-400 transition-colors"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

Note: Use Next.js `usePathname()` in a Client Component wrapper to highlight the active tab with `border-blue-600 text-blue-700`.

### 新增 `src/app/analysis/report/page.tsx`

這是 CIO 報告頁，內容與 prompt-38 `codex-prompt-38-cio-report-page.md` 相同，但路徑改為 `/analysis/report`。同時在頁首加上下載和上傳按鈕（見 Part 3）。

**`/analysis/cio/page.tsx` 保留原樣不動**（不刪除，避免 breaking change）。

### 更新 `src/app/layout.tsx` 導航

把「分析」的 nav link label 保持不變，但在 nav 末尾不需要額外加 CIO 連結（tab 已處理）。

---

## Part 2 — PDF 生成

### 新增 `src/lib/report/pdf.tsx`

使用 `@react-pdf/renderer` 生成專業 PDF。這個檔案 export 一個 `generateReportPdf` function。

```tsx
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  renderToBuffer
} from "@react-pdf/renderer";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamReportRow = {
  team_name: string;
  team_leader: string;
  division: string;
  final_team_view: {
    summary?: string;
    mostImportantAction?: string;
    confidence?: number;
  } | null;
};

type DivisionRow = {
  division: string;
  division_manager: string;
  market_summary: string | null;
  decision_action: string | null;
  confidence: number | null;
};

type CommitteeRow = {
  model_provider: string;
  final_action: string | null;
  action_type: string | null;
  consensus_level: string | null;
  confidence: number | null;
  reason: string | null;
  agreements: string[] | null;
  disagreements: string[] | null;
  final_buy_zone: string | null;
  final_target_price: string | null;
  final_stop_loss: string | null;
  final_recommendations: Record<string, unknown>[] | null;
  is_action_allowed: boolean | null;
  what_could_change_decision: string[] | null;
};

export type ReportData = {
  runDate: string;
  teamReports: TeamReportRow[];
  divisions: DivisionRow[];
  committees: CommitteeRow[];
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const colors = {
  primary: "#1D4ED8",      // blue-700
  primaryLight: "#DBEAFE", // blue-100
  dark: "#0F172A",         // slate-900
  mid: "#475569",          // slate-600
  light: "#94A3B8",        // slate-400
  border: "#E2E8F0",       // slate-200
  bg: "#F8FAFC",           // slate-50
  white: "#FFFFFF",
  green: "#15803D",
  red: "#B91C1C",
  amber: "#B45309"
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: colors.white,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48
  },
  // Cover
  coverPage: {
    fontFamily: "Helvetica",
    backgroundColor: colors.primary,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center"
  },
  coverLogo: {
    width: 80,
    height: 80,
    marginBottom: 24
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
    marginBottom: 8
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#BFDBFE",
    marginBottom: 4
  },
  coverDate: {
    fontSize: 12,
    color: "#93C5FD"
  },
  // Header
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary
  },
  headerImage: {
    width: "100%",
    height: 36,
    objectFit: "cover",
    objectPositionY: "center"
  },
  headerTitle: {
    fontSize: 10,
    color: colors.mid,
    fontFamily: "Helvetica-Bold"
  },
  headerDate: {
    fontSize: 9,
    color: colors.light
  },
  // Section
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.dark,
    marginBottom: 12,
    marginTop: 20,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  // Card
  card: {
    backgroundColor: colors.bg,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.dark,
    marginBottom: 6
  },
  cardSubtitle: {
    fontSize: 9,
    color: colors.mid,
    marginBottom: 4
  },
  // Grid
  row2: {
    flexDirection: "row",
    gap: 10
  },
  col: {
    flex: 1
  },
  // Table
  table: {
    marginBottom: 12
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3
  },
  tableHeaderCell: {
    fontSize: 8,
    color: colors.white,
    fontFamily: "Helvetica-Bold",
    flex: 1
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  tableRowAlt: {
    backgroundColor: colors.bg
  },
  tableCell: {
    fontSize: 8,
    color: colors.dark,
    flex: 1,
    paddingRight: 4
  },
  // Text styles
  body: {
    fontSize: 9,
    color: colors.mid,
    lineHeight: 1.5
  },
  label: {
    fontSize: 8,
    color: colors.light,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2
  },
  value: {
    fontSize: 9,
    color: colors.dark,
    fontFamily: "Helvetica-Bold"
  },
  badge: {
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 8,
    fontFamily: "Helvetica-Bold"
  },
  bullet: {
    fontSize: 8,
    color: colors.mid,
    marginBottom: 2,
    paddingLeft: 8
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8
  },
  footerText: {
    fontSize: 8,
    color: colors.light
  }
});

// ─── Components ───────────────────────────────────────────────────────────────

const headerImagePath = path.join(process.cwd(), "public", "PDF Header.png");

function PageHeader({ runDate }: { runDate: string }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Image src={headerImagePath} style={{ width: "100%", height: 48, objectFit: "cover", marginBottom: 8 }} />
      <View style={[styles.pageHeader, { marginBottom: 0 }]}>
        <Text style={styles.headerTitle}>台美股投資決策系統 · CIO 每日簡報</Text>
      </View>
      <Text style={styles.headerDate}>{runDate}</Text>
    </View>
  );
}

function PageFooter({ pageNumber }: { pageNumber: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>台美股投資決策系統 · 機密文件 · 僅供內部參考</Text>
      <Text style={styles.footerText}>第 {pageNumber} 頁</Text>
    </View>
  );
}

function KVPair({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function ReportDocument({ data }: { data: ReportData }) {
  const gptTeams = data.teamReports.filter((t) => t.division === "GPT Division");
  const claudeTeams = data.teamReports.filter((t) => t.division === "Claude Division");
  const committeeA = data.committees.find((c) => c.model_provider === "OpenAI");
  const committeeB = data.committees.find((c) => c.model_provider === "Anthropic");

  return (
    <Document
      title={`CIO 每日簡報 ${data.runDate}`}
      author="台美股投資決策系統"
      subject="每日市場分析報告"
      creator="Stocks AI"
    >
      {/* ── Cover ── */}
      <Page size="A4" style={styles.coverPage}>
        {/* Full-width header image at top */}
        <Image src={headerImagePath} style={{ width: "100%", height: 200, objectFit: "cover" }} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 48 }}>
          <Text style={styles.coverTitle}>CIO 每日簡報</Text>
          <Text style={styles.coverSubtitle}>台美股投資決策系統</Text>
          <Text style={styles.coverDate}>{data.runDate}</Text>
        </View>
        <View style={{ position: "absolute", bottom: 32, left: 0, right: 0, alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: "#94A3B8", textAlign: "center" }}>
            機密文件 · 僅供內部參考 · Cross-Division Investment Committee
          </Text>
        </View>
      </Page>

      {/* ── Page 1: Market + Teams ── */}
      <Page size="A4" style={styles.page}>
        <PageHeader runDate={data.runDate} />

        {/* Market Environment */}
        <Text style={styles.sectionTitle}>一、市場環境</Text>
        <View style={styles.row2}>
          {data.divisions.map((div) => (
            <View key={div.division} style={[styles.card, styles.col]}>
              <Text style={styles.cardTitle}>{div.division_manager} · {div.division}</Text>
              <Text style={styles.body}>{div.market_summary ?? "—"}</Text>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                <KVPair label="決策" value={div.decision_action ?? "—"} />
                <KVPair label="信心" value={div.confidence != null ? `${div.confidence}%` : "—"} />
              </View>
            </View>
          ))}
        </View>

        {/* Team Summary */}
        <Text style={styles.sectionTitle}>二、AI 團隊總結</Text>

        {[{ label: "GPT Division", teams: gptTeams }, { label: "Claude Division", teams: claudeTeams }].map(
          ({ label, teams }) => (
            <View key={label} style={{ marginBottom: 12 }}>
              <Text style={[styles.label, { marginBottom: 6, fontSize: 9 }]}>{label}</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Team</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 3 }]}>今日最重要行動</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: "right" }]}>信心</Text>
                </View>
                {teams.map((team, i) => (
                  <View key={team.team_name} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <View style={{ flex: 1.5 }}>
                      <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>{team.team_name}</Text>
                      <Text style={[styles.tableCell, { color: colors.light, fontSize: 7 }]}>{team.team_leader}</Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 3 }]}>
                      {team.final_team_view?.mostImportantAction ?? "—"}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 0.7, textAlign: "right" }]}>
                      {team.final_team_view?.confidence != null ? `${team.final_team_view.confidence}%` : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )
        )}

        <PageFooter pageNumber={1} />
      </Page>

      {/* ── Page 2: Committee A vs B ── */}
      <Page size="A4" style={styles.page}>
        <PageHeader runDate={data.runDate} />

        <Text style={styles.sectionTitle}>三、委員會決策對比</Text>
        <View style={styles.row2}>
          {[
            { c: committeeA, label: "Committee A · GPT (gpt-5.5)" },
            { c: committeeB, label: "Committee B · Claude (claude-sonnet-4-6)" }
          ].map(({ c, label }) => {
            if (!c) return null;
            return (
              <View key={label} style={[styles.card, styles.col]}>
                <Text style={styles.cardTitle}>{label}</Text>
                <View
                  style={{
                    backgroundColor: c.is_action_allowed ? "#DCFCE7" : "#F1F5F9",
                    borderRadius: 3,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    marginBottom: 8,
                    alignSelf: "flex-start"
                  }}
                >
                  <Text style={{ fontSize: 8, color: c.is_action_allowed ? colors.green : colors.mid, fontFamily: "Helvetica-Bold" }}>
                    {c.is_action_allowed ? "✓ 允許行動" : "— 建議觀望"}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <KVPair label="結論" value={c.action_type ?? "—"} />
                  <KVPair label="共識" value={c.consensus_level ?? "—"} />
                  <KVPair label="信心" value={c.confidence != null ? `${c.confidence}%` : "—"} />
                  <KVPair label="進場" value={c.final_buy_zone ?? "—"} />
                  <KVPair label="目標" value={c.final_target_price ?? "—"} />
                  <KVPair label="停損" value={c.final_stop_loss ?? "—"} />
                </View>

                <Text style={[styles.label, { color: colors.mid }]}>決策理由</Text>
                <Text style={[styles.body, { marginBottom: 8 }]}>{c.reason ?? "—"}</Text>

                {(c.agreements ?? []).length > 0 && (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={[styles.label, { color: colors.green }]}>共識點</Text>
                    {(c.agreements ?? []).map((a, i) => (
                      <Text key={i} style={styles.bullet}>· {a}</Text>
                    ))}
                  </View>
                )}

                {(c.disagreements ?? []).length > 0 && (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={[styles.label, { color: colors.red }]}>分歧點</Text>
                    {(c.disagreements ?? []).map((d, i) => (
                      <Text key={i} style={styles.bullet}>· {d}</Text>
                    ))}
                  </View>
                )}

                {(c.what_could_change_decision ?? []).length > 0 && (
                  <View>
                    <Text style={[styles.label, { color: colors.amber }]}>可能改變決策的因素</Text>
                    {(c.what_could_change_decision ?? []).map((w, i) => (
                      <Text key={i} style={styles.bullet}>· {w}</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <PageFooter pageNumber={2} />
      </Page>

      {/* ── Page 3: Recommendations ── */}
      <Page size="A4" style={styles.page}>
        <PageHeader runDate={data.runDate} />

        <Text style={styles.sectionTitle}>四、具體建議清單</Text>

        {[
          { c: committeeA, label: "Committee A (GPT)" },
          { c: committeeB, label: "Committee B (Claude)" }
        ].map(({ c, label }) => {
          const recs = (c?.final_recommendations ?? []) as Record<string, unknown>[];
          if (recs.length === 0) return null;
          return (
            <View key={label} style={{ marginBottom: 16 }}>
              <Text style={[styles.label, { marginBottom: 6, fontSize: 9 }]}>{label}</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  {["標的", "操作", "進場", "目標", "停損", "倉位", "信心"].map((h) => (
                    <Text key={h} style={styles.tableHeaderCell}>{h}</Text>
                  ))}
                </View>
                {recs.map((rec, i) => (
                  <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>
                      {String(rec.ticker ?? rec.symbol ?? rec.security ?? "—")}
                    </Text>
                    <Text style={styles.tableCell}>{String(rec.action ?? "—")}</Text>
                    <Text style={styles.tableCell}>
                      {String(rec.buyZoneLow ?? rec.buy_zone_low ?? "—")}
                    </Text>
                    <Text style={styles.tableCell}>
                      {String(rec.targetPrice ?? rec.target_price ?? "—")}
                    </Text>
                    <Text style={styles.tableCell}>
                      {String(rec.stopLoss ?? rec.stop_loss ?? "—")}
                    </Text>
                    <Text style={styles.tableCell}>
                      {String(rec.positionSizePct ?? rec.position_size_pct ?? "—")}
                    </Text>
                    <Text style={styles.tableCell}>{String(rec.confidence ?? "—")}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={[styles.card, { backgroundColor: "#FEF9C3", borderColor: "#FDE68A", marginTop: 8 }]}>
          <Text style={[styles.body, { color: "#92400E", fontFamily: "Helvetica-Bold" }]}>
            免責聲明
          </Text>
          <Text style={[styles.body, { color: "#92400E", marginTop: 4 }]}>
            本報告由 AI 分析系統自動生成，僅供參考，不構成投資建議。投資涉及風險，請自行評估並諮詢專業意見。
          </Text>
        </View>

        <PageFooter pageNumber={3} />
      </Page>
    </Document>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportDocument data={data} />);
  return Buffer.from(buffer);
}
```

---

## Part 3 — PDF 下載 API Route

### 新增 `src/app/api/report/pdf/[runId]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateReportPdf, type ReportData } from "@/lib/report/pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const runId = params.runId;

  // Verify run belongs to user
  const { data: run } = await supabase
    .from("daily_runs")
    .select("id, run_date")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!run) return new NextResponse("Not found", { status: 404 });

  const [teamRes, divRes, committeeRes] = await Promise.all([
    supabase
      .from("team_reports")
      .select("team_name, team_leader, division, final_team_view")
      .eq("daily_run_id", runId)
      .eq("user_id", user.id)
      .order("division").order("created_at"),
    supabase
      .from("division_decisions")
      .select("division, division_manager, market_summary, decision_action, confidence")
      .eq("daily_run_id", runId)
      .eq("user_id", user.id),
    supabase
      .from("committee_decisions")
      .select("model_provider, final_action, action_type, consensus_level, confidence, reason, agreements, disagreements, final_buy_zone, final_target_price, final_stop_loss, final_recommendations, is_action_allowed, what_could_change_decision")
      .eq("daily_run_id", runId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
  ]);

  const reportData: ReportData = {
    runDate: String(run.run_date),
    teamReports: (teamRes.data ?? []) as ReportData["teamReports"],
    divisions: (divRes.data ?? []) as ReportData["divisions"],
    committees: (committeeRes.data ?? []) as ReportData["committees"]
  };

  const pdfBuffer = await generateReportPdf(reportData);
  const filename = `StocksAI-CIO-Report-${run.run_date}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
```

---

## Part 4 — OneDrive 上傳 API Route

### 新增 `src/lib/report/onedrive.ts`

```ts
async function getMicrosoftAccessToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials not configured");
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default"
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get Microsoft token: ${text}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

export async function uploadToOneDrive(params: {
  filename: string;
  pdfBuffer: Buffer;
}): Promise<{ webUrl: string }> {
  const driveId = process.env.MICROSOFT_DRIVE_ID;
  if (!driveId) throw new Error("MICROSOFT_DRIVE_ID not configured");

  const accessToken = await getMicrosoftAccessToken();

  // Upload to StocksAI/Reports/ folder
  const uploadPath = encodeURIComponent(`StocksAI/Reports/${params.filename}`);
  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${uploadPath}:/content`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/pdf"
    },
    body: params.pdfBuffer
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`OneDrive upload failed: ${text}`);
  }

  const fileData = await uploadResponse.json() as { webUrl: string };
  return { webUrl: fileData.webUrl };
}
```

### 新增 `src/app/api/report/onedrive/[runId]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateReportPdf, type ReportData } from "@/lib/report/pdf";
import { uploadToOneDrive } from "@/lib/report/onedrive";

export async function POST(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runId = params.runId;

  const { data: run } = await supabase
    .from("daily_runs")
    .select("id, run_date")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [teamRes, divRes, committeeRes] = await Promise.all([
    supabase.from("team_reports").select("team_name, team_leader, division, final_team_view").eq("daily_run_id", runId).eq("user_id", user.id).order("division").order("created_at"),
    supabase.from("division_decisions").select("division, division_manager, market_summary, decision_action, confidence").eq("daily_run_id", runId).eq("user_id", user.id),
    supabase.from("committee_decisions").select("model_provider, final_action, action_type, consensus_level, confidence, reason, agreements, disagreements, final_buy_zone, final_target_price, final_stop_loss, final_recommendations, is_action_allowed, what_could_change_decision").eq("daily_run_id", runId).eq("user_id", user.id).order("created_at", { ascending: true })
  ]);

  const reportData: ReportData = {
    runDate: String(run.run_date),
    teamReports: (teamRes.data ?? []) as ReportData["teamReports"],
    divisions: (divRes.data ?? []) as ReportData["divisions"],
    committees: (committeeRes.data ?? []) as ReportData["committees"]
  };

  const pdfBuffer = await generateReportPdf(reportData);
  const filename = `StocksAI-CIO-Report-${run.run_date}.pdf`;

  const { webUrl } = await uploadToOneDrive({ filename, pdfBuffer });

  return NextResponse.json({ success: true, webUrl, filename });
}
```

---

## Part 5 — 報告頁加下載與上傳按鈕

### 新增 `src/components/report-actions.tsx`（Client Component）

```tsx
"use client";

import { useState } from "react";

export function ReportActions({ runId, runDate }: { runId: string; runDate: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ webUrl: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/onedrive/${runId}`, { method: "POST" });
      const data = await res.json() as { success?: boolean; webUrl?: string; filename?: string; error?: string };
      if (data.success && data.webUrl && data.filename) {
        setUploadResult({ webUrl: data.webUrl, filename: data.filename });
      } else {
        setError(data.error ?? "上傳失敗");
      }
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Download PDF */}
      <a
        href={`/api/report/pdf/${runId}`}
        download={`StocksAI-CIO-Report-${runDate}.pdf`}
        className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        下載 PDF
      </a>

      {/* Upload to OneDrive */}
      {!uploadResult ? (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {uploading ? "上傳中..." : "上傳到 OneDrive"}
        </button>
      ) : (
        <a
          href={uploadResult.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          在 OneDrive 開啟
        </a>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

### 在 `src/app/analysis/report/page.tsx` 頁首加入

```tsx
import { ReportActions } from "@/components/report-actions";

// 在頁首 section 加入（latestRun 必須存在）:
<div className="flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-semibold text-slate-950">CIO 每日簡報</h1>
    <p className="mt-1 text-sm text-slate-500">{latestRun.run_date} · {latestRun.status}</p>
  </div>
  <ReportActions runId={latestRun.id} runDate={String(latestRun.run_date)} />
</div>
```

---

## Part 6 — next.config 允許 @react-pdf/renderer

`@react-pdf/renderer` 在 Next.js App Router 需要標記為 server-only。在 `next.config.ts` 或 `next.config.js` 加入：

```ts
const nextConfig = {
  // ... existing config
  serverExternalPackages: ["@react-pdf/renderer"]
};
```

---

## Part 7 — 更新 `.env.example`

```env
# Microsoft Graph / OneDrive (for PDF upload)
MICROSOFT_CLIENT_ID=
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_DRIVE_ID=
```

---

## 使用者操作流程

1. 到「分析」→「CIO 報告」tab
2. 看完報告後，點「下載 PDF」→ 直接下載到電腦
3. 或點「上傳到 OneDrive」→ 自動上傳至 OneDrive `StocksAI/Reports/` 資料夾 → 點「在 OneDrive 開啟」可直接分享連結

---

## 注意事項

- `public/PDF Header.png` 必須存在，否則 PDF 生成會失敗。Codex 執行前請確認已手動放置（檔名含空格，注意路徑正確）
- OneDrive 上傳使用 client credentials flow（app-only），不需要用戶登入 Microsoft
- PDF 生成是 server-side，不在瀏覽器執行，效能穩定
- 若 `StocksAI/Reports/` 資料夾不存在，Graph API 的 `root:/{path}:/content` 會自動建立
