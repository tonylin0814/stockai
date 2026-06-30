/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer
} from "@react-pdf/renderer";
import path from "path";
import type { ReportData, ReportTeamRow } from "@/lib/report/data";

const colors = {
  primary: "#1D4ED8",
  primaryLight: "#DBEAFE",
  dark: "#0F172A",
  mid: "#475569",
  light: "#94A3B8",
  border: "#E2E8F0",
  bg: "#F8FAFC",
  white: "#FFFFFF",
  green: "#15803D",
  red: "#B91C1C",
  amber: "#B45309"
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: colors.white,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40
  },
  coverPage: {
    fontFamily: "Helvetica",
    backgroundColor: colors.primary,
    padding: 0
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
    marginBottom: 8,
    textAlign: "center"
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#BFDBFE",
    marginBottom: 4,
    textAlign: "center"
  },
  coverDate: {
    fontSize: 12,
    color: "#DBEAFE",
    textAlign: "center"
  },
  pageHeader: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary
  },
  headerImage: {
    width: "100%",
    height: 42,
    objectFit: "cover",
    marginBottom: 8
  },
  headerTitle: {
    fontSize: 10,
    color: colors.mid,
    fontFamily: "Helvetica-Bold"
  },
  headerDate: {
    fontSize: 9,
    color: colors.light,
    marginTop: 3
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.dark,
    marginBottom: 10,
    marginTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: 6,
    padding: 10,
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
  row2: {
    flexDirection: "row",
    marginBottom: 4
  },
  colLeft: {
    flex: 1,
    marginRight: 6
  },
  colRight: {
    flex: 1,
    marginLeft: 6
  },
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
  bullet: {
    fontSize: 8,
    color: colors.mid,
    marginBottom: 2
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8
  },
  footerText: {
    fontSize: 8,
    color: colors.light
  }
});

const headerImagePath = path.join(process.cwd(), "public", "PDF Header.png");

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function percent(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : String(value);
}

function PageHeader({ runDate }: { runDate: string }) {
  return (
    <View style={styles.pageHeader}>
      <Image src={headerImagePath} style={styles.headerImage} />
      <Text style={styles.headerTitle}>台美股投資決策系統 - CIO 每日簡報</Text>
      <Text style={styles.headerDate}>{runDate}</Text>
    </View>
  );
}

function PageFooter({ pageNumber }: { pageNumber: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>台美股投資決策系統 - 機密文件 - 僅供內部參考</Text>
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

function byDivision(teams: ReportTeamRow[], division: string) {
  return teams.filter((team) => team.division === division);
}

function recommendationValue(rec: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = rec[key];
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return "-";
}

function ReportDocument({ data }: { data: ReportData }) {
  const gptTeams = byDivision(data.teamReports, "GPT Division");
  const claudeTeams = byDivision(data.teamReports, "Claude Division");
  const otherTeams = data.teamReports.filter(
    (team) => team.division !== "GPT Division" && team.division !== "Claude Division"
  );
  const committeeA = data.committees.find((committee) => committee.model_provider === "OpenAI");
  const committeeB = data.committees.find((committee) => committee.model_provider === "Anthropic");

  return (
    <Document
      title={`CIO 每日簡報 ${data.runDate}`}
      author="台美股投資決策系統"
      subject="每日市場分析報告"
      creator="Stocks AI"
    >
      <Page size="A4" style={styles.coverPage}>
        <Image src={headerImagePath} style={{ width: "100%", height: 200, objectFit: "cover" }} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 48 }}>
          <Text style={styles.coverTitle}>CIO 每日簡報</Text>
          <Text style={styles.coverSubtitle}>台美股投資決策系統</Text>
          <Text style={styles.coverDate}>{data.runDate}</Text>
        </View>
        <View style={{ position: "absolute", bottom: 32, left: 0, right: 0, alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: "#DBEAFE", textAlign: "center" }}>
            機密文件 - 僅供內部參考 - Cross-Division Investment Committee
          </Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader runDate={data.runDate} />
        <Text style={styles.sectionTitle}>一、市場環境</Text>
        <View style={styles.row2}>
          {data.divisions.map((division, index) => (
            <View key={division.division} style={[styles.card, index % 2 === 0 ? styles.colLeft : styles.colRight]}>
              <Text style={styles.cardTitle}>
                {division.division_manager} - {division.division}
              </Text>
              <Text style={styles.body}>{text(division.market_summary)}</Text>
              <View style={{ flexDirection: "row", marginTop: 8 }}>
                <View style={{ marginRight: 16 }}>
                  <KVPair label="決策" value={text(division.decision_action)} />
                </View>
                <KVPair label="信心" value={percent(division.confidence)} />
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>二、AI 團隊總結</Text>
        {[
          { label: "GPT Division", teams: gptTeams },
          { label: "Claude Division", teams: claudeTeams },
          { label: "Other", teams: otherTeams }
        ]
          .filter((group) => group.teams.length > 0)
          .map(({ label, teams }) => (
            <View key={label} style={{ marginBottom: 12 }}>
              <Text style={[styles.label, { marginBottom: 6, fontSize: 9 }]}>{label}</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Team</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 3 }]}>今日最重要行動</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: "right" }]}>信心</Text>
                </View>
                {teams.map((team, index) => (
                  <View
                    key={`${team.division}-${team.team_name}`}
                    style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                  >
                    <View style={{ flex: 1.5 }}>
                      <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>{team.team_name}</Text>
                      <Text style={[styles.tableCell, { color: colors.light, fontSize: 7 }]}>{team.team_leader}</Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 3 }]}>
                      {text(team.final_team_view?.mostImportantAction ?? team.final_team_view?.summary)}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 0.7, textAlign: "right" }]}>
                      {percent(team.final_team_view?.confidence ?? team.confidence)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        <PageFooter pageNumber={1} />
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader runDate={data.runDate} />
        <Text style={styles.sectionTitle}>三、委員會決策對比</Text>
        <View style={styles.row2}>
          {[
            { committee: committeeA, label: "Committee A - GPT" },
            { committee: committeeB, label: "Committee B - Claude" }
          ].map(({ committee, label }, index) => {
            if (!committee) return null;
            return (
              <View key={label} style={[styles.card, index === 0 ? styles.colLeft : styles.colRight]}>
                <Text style={styles.cardTitle}>{label}</Text>
                <View
                  style={{
                    backgroundColor: committee.is_action_allowed ? "#DCFCE7" : "#F1F5F9",
                    borderRadius: 3,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    marginBottom: 8,
                    alignSelf: "flex-start"
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8,
                      color: committee.is_action_allowed ? colors.green : colors.mid,
                      fontFamily: "Helvetica-Bold"
                    }}
                  >
                    {committee.is_action_allowed ? "允許行動" : "建議觀望"}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
                  <View style={{ width: "50%" }}>
                    <KVPair label="結論" value={text(committee.action_type ?? committee.final_action)} />
                  </View>
                  <View style={{ width: "50%" }}>
                    <KVPair label="共識" value={text(committee.consensus_level)} />
                  </View>
                  <View style={{ width: "50%" }}>
                    <KVPair label="信心" value={percent(committee.confidence)} />
                  </View>
                  <View style={{ width: "50%" }}>
                    <KVPair label="進場" value={text(committee.final_buy_zone)} />
                  </View>
                  <View style={{ width: "50%" }}>
                    <KVPair label="目標" value={text(committee.final_target_price)} />
                  </View>
                  <View style={{ width: "50%" }}>
                    <KVPair label="停損" value={text(committee.final_stop_loss)} />
                  </View>
                </View>

                <Text style={[styles.label, { color: colors.mid }]}>決策理由</Text>
                <Text style={[styles.body, { marginBottom: 8 }]}>{text(committee.reason)}</Text>

                {(committee.agreements ?? []).length > 0 ? (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={[styles.label, { color: colors.green }]}>共識點</Text>
                    {(committee.agreements ?? []).map((item, itemIndex) => (
                      <Text key={itemIndex} style={styles.bullet}>
                        - {item}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {(committee.disagreements ?? []).length > 0 ? (
                  <View>
                    <Text style={[styles.label, { color: colors.red }]}>分歧點</Text>
                    {(committee.disagreements ?? []).map((item, itemIndex) => (
                      <Text key={itemIndex} style={styles.bullet}>
                        - {item}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <PageFooter pageNumber={2} />
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader runDate={data.runDate} />
        <Text style={styles.sectionTitle}>四、具體建議清單</Text>
        {[
          { committee: committeeA, label: "Committee A (GPT)" },
          { committee: committeeB, label: "Committee B (Claude)" }
        ].map(({ committee, label }) => {
          const recommendations = committee?.final_recommendations ?? [];
          if (recommendations.length === 0) return null;
          return (
            <View key={label} style={{ marginBottom: 16 }}>
              <Text style={[styles.label, { marginBottom: 6, fontSize: 9 }]}>{label}</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  {["標的", "操作", "進場", "目標", "停損", "倉位", "信心"].map((header) => (
                    <Text key={header} style={styles.tableHeaderCell}>{header}</Text>
                  ))}
                </View>
                {recommendations.map((rec, index) => (
                  <View key={index} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}>
                    <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>
                      {recommendationValue(rec, ["ticker", "symbol", "security"])}
                    </Text>
                    <Text style={styles.tableCell}>{recommendationValue(rec, ["action"])}</Text>
                    <Text style={styles.tableCell}>
                      {recommendationValue(rec, ["buyZone", "buy_zone", "entryPoint", "entry_point", "buyZoneLow", "buy_zone_low"])}
                    </Text>
                    <Text style={styles.tableCell}>{recommendationValue(rec, ["targetPrice", "target_price"])}</Text>
                    <Text style={styles.tableCell}>{recommendationValue(rec, ["stopLoss", "stop_loss"])}</Text>
                    <Text style={styles.tableCell}>{recommendationValue(rec, ["positionSizePct", "position_size_pct"])}</Text>
                    <Text style={styles.tableCell}>{percent(rec.confidence)}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={[styles.card, { backgroundColor: "#FEF9C3", borderColor: "#FDE68A", marginTop: 8 }]}>
          <Text style={[styles.body, { color: "#92400E", fontFamily: "Helvetica-Bold" }]}>免責聲明</Text>
          <Text style={[styles.body, { color: "#92400E", marginTop: 4 }]}>
            本報告由 AI 分析系統自動生成，僅供參考，不構成投資建議。投資涉及風險，請自行評估並諮詢專業意見。
          </Text>
        </View>
        <PageFooter pageNumber={3} />
      </Page>
    </Document>
  );
}

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportDocument data={data} />);
  return Buffer.from(buffer);
}
