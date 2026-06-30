# Codex Prompt 10 — Team Specialization (五種專業分析角色)

**Goal**: Give each of the 5 teams a distinct analytical focus instead of running identical prompts. The DB already has `division_teams.team_role` — this prompt wires it into the prompt pipeline.

**Apply after**: Prompts 01–09 applied.

---

## Background

Currently all 5 teams run the exact same 4 agent prompts. The `DivisionTeam` type already has `team_role: string | null` (confirmed in `src/lib/analysis/pipeline/team.ts` line 27), and `PromptIdentity` is constructed in `runTeamPipeline` at line 294–300 without including `team_role`.

The 5 specializations:
- `"technical"` — charts, momentum, RSI/MACD signals, breakouts
- `"fundamental"` — earnings quality, valuation, moat, balance sheet
- `"macro"` — interest rates, FX, sector rotation, geopolitics
- `"sentiment"` — news flow, catalysts, analyst sentiment, social indicators
- `"risk"` — contrarian, stress tests, what can go wrong, position sizing

---

## Step 1: Add `teamRole` to `PromptIdentity`

In `src/lib/analysis/prompts/common.ts`, update the `PromptIdentity` type:

```typescript
export type PromptIdentity = {
  agentName: string;
  teamName: string;
  teamLeader: string;
  divisionName: string;
  divisionManager: string;
  teamRole?: string | null; // ADD THIS
};
```

---

## Step 2: Add `getRoleGuidance()` to `common.ts`

In `src/lib/analysis/prompts/common.ts`, add this function after the `PromptIdentity` type:

```typescript
/**
 * Returns role-specific analysis instructions for a team agent.
 * This is injected into every agent prompt to give each team a distinct lens.
 *
 * @param teamRole - the team_role value from division_teams table
 * @param agentType - which agent is asking (marketReview | portfolioReview | missionAnalysis | marketScan | teamLeader)
 */
export function getRoleGuidance(
  teamRole: string | null | undefined,
  agentType: string
): string {
  if (!teamRole) return "";

  const role = teamRole.toLowerCase();

  const ROLE_INTROS: Record<string, string> = {
    technical: "你的團隊專長是技術分析。",
    fundamental: "你的團隊專長是基本面深度研究。",
    macro: "你的團隊專長是總體經濟與市場環境分析。",
    sentiment: "你的團隊專長是市場情緒、新聞催化劑與消息面分析。",
    risk: "你的團隊專長是風險評估、壓力測試與反向思考。",
  };

  const ROLE_FOCUS: Record<string, Record<string, string>> = {
    technical: {
      marketReview: `
在市場評估中，優先分析：
- 大盤指數的技術型態（支撐/壓力位）
- 市場動能指標（RSI 超買/超賣、MACD 交叉）
- 成交量變化（放量突破 vs 縮量整理）
- 強勢板塊輪動訊號
`,
      portfolioReview: `
在持股檢視中，優先分析：
- 每檔持股的技術型態（趨勢、均線排列、布林通道位置）
- 是否接近關鍵支撐/壓力位
- RSI 是否進入超買/超賣區間
- MACD 金叉/死叉訊號
- 成交量是否確認目前走勢
不要重複說明基本面，專注技術面。
`,
      missionAnalysis: `
任務分析聚焦技術面：
- 哪些標的有明確技術買入訊號（突破、金叉、反彈確認）？
- 哪些標的有技術賣出訊號（跌破支撐、死叉、放量下跌）？
- 今日最重要的技術面觀察點是什麼？
`,
      marketScan: `
市場掃描時優先尋找：
- 技術突破型態（52週新高、整理後放量突破）
- 強勢整理後的拉回買點（pullback to SMA20）
- 嚴重超賣可能反彈的標的（RSI < 30 + 支撐確認）
`,
      teamLeader: `
整合各代理人的技術面觀點，確保最終建議有明確的技術依據：
- 進場點（技術面確認的最佳買入區間）
- 出場點（技術面停損位，通常是關鍵支撐跌破）
- 目標價（技術面阻力位或前高）
`,
    },

    fundamental: {
      marketReview: `
在市場評估中，優先分析：
- 當前市場估值（S&P500 P/E、P/B 是否合理）
- 總體企業獲利趨勢（EPS 修正方向）
- 優質企業與劣質企業的估值差距（quality spread）
`,
      portfolioReview: `
在持股檢視中，優先分析（Layer 2 AI 訓練知識必須完整執行）：
- 每檔持股的商業模式品質與護城河強度
- 當前估值是否合理（PE、PB 相對歷史平均）
- 近期財報或法說會有無重要更新
- 長期成長動能是否維持
不要重複描述技術走勢，聚焦商業基本面。
`,
      missionAnalysis: `
任務分析聚焦基本面：
- 投資組合中是否有基本面惡化的持股需要警示？
- 關注清單中有無估值回到合理區間的優質股？
- 今日最重要的基本面變化是什麼？
`,
      marketScan: `
市場掃描時優先尋找：
- 基本面優質但股價因短期雜音回調的機會
- 估值相對同業或歷史平均明顯偏低的標的
- 剛公布優於預期財報但股價尚未反映的標的
`,
      teamLeader: `
整合各代理人的基本面觀點，確保最終建議有清楚的基本面依據：
- 估值合理範圍（基於基本面的合理 PE/PB 目標）
- 護城河評估（為什麼這家公司 5 年後還有競爭力）
- 財務風險（債務、現金流、獲利品質）
`,
    },

    macro: {
      marketReview: `
在市場評估中，優先分析：
- 利率環境（聯準會政策方向、10 年期殖利率走勢）
- 匯率影響（美元強弱對不同產業的影響）
- 總體經濟數據（CPI、GDP、就業、PMI 近期趨勢）
- 地緣政治風險（台海、中美貿易、科技禁令）
- 資金流向（債券 vs 股票、防禦 vs 成長輪動）
`,
      portfolioReview: `
在持股檢視中，優先分析：
- 每檔持股對當前總經環境的敏感度
- 升息/降息環境對持股估值的影響
- 匯率變動對台股持股的衝擊（出口比重）
- 目前持股組合的總體經濟暴露是否均衡
`,
      missionAnalysis: `
任務分析聚焦總體環境：
- 當前總體環境對投資組合最大的威脅是什麼？
- 有沒有即將公布的重要經濟數據（Fed 決議、CPI、非農）需要提前警示？
- 現在是應該增加防禦性配置還是可以積極進攻？
`,
      marketScan: `
市場掃描時優先尋找：
- 在當前總經環境中結構性受益的板塊或標的
- 總經逆風但被過度錯殺的優質標的
- 即將有重大政策或數據催化劑的相關板塊
`,
      teamLeader: `
整合各代理人的總體觀點，確保最終建議考慮總體環境：
- 時機（現在的總體環境是否適合進場？）
- 板塊偏好（哪些板塊在當前環境有結構性優勢？）
- 風險情境（如果 Fed 超預期升息或降息，對建議的影響？）
`,
    },

    sentiment: {
      marketReview: `
在市場評估中，優先分析：
- 整體市場情緒指標（Fear & Greed、VIX 水準）
- 近期重大新聞對市場情緒的影響
- 散戶 vs 機構的行為差異
- 社群媒體或媒體報導的情緒傾向
`,
      portfolioReview: `
在持股檢視中，優先分析：
- 每檔持股近期新聞的情緒傾向（正面/負面/中性）
- 有無重大催化劑（財報、法說會、產品發表、合作消息）
- 分析師評等是否有近期調整
- 市場對此標的的預期是否過於樂觀或悲觀
`,
      missionAnalysis: `
任務分析聚焦情緒與催化劑：
- 今日最重要的新聞或事件是什麼？
- 情緒極端（過度恐慌或過度貪婪）是否創造機會或風險？
- 近期有哪些即將到來的催化劑值得等待？
`,
      marketScan: `
市場掃描時優先尋找：
- 有正面催化劑即將發生的標的（財報前、產品發表前）
- 因短期負面新聞過度下跌但基本面未變的標的
- 市場情緒最極端（最悲觀或最樂觀）的標的
`,
      teamLeader: `
整合各代理人的情緒與催化劑觀點：
- 情緒時機（等到恐慌到頂再進場，而非追高）
- 催化劑確認（進場前確認有具體催化劑支撐）
- 炒作風險（警示任何可能是純情緒炒作而非基本面驅動的標的）
`,
    },

    risk: {
      marketReview: `
在市場評估中，優先分析（反向思考）：
- 當前市場最容易被忽視的尾端風險是什麼？
- 目前市場共識是什麼？共識錯了會怎樣？
- 系統性風險是否正在累積（槓桿、估值、流動性）？
- VIX 當前水準暗示市場低估了哪些風險？
`,
      portfolioReview: `
在持股檢視中，以壓力測試視角分析：
- 若大盤跌 10-20%，哪些持股最脆弱？
- 每檔持股的最壞情境（bear case）是什麼？
- 停損設定是否合理？有無持股已接近或跌破停損？
- 集中風險：持股是否過於集中在單一板塊或主題？
`,
      missionAnalysis: `
任務分析聚焦風險管控：
- 今日最需要降低的風險暴露是什麼？
- 是否有任何持股的停損應該調整？
- 目前整體部位的風險報酬是否仍然合理？
- 若你必須找出投資組合的致命弱點，那是什麼？
`,
      marketScan: `
市場掃描時優先識別：
- 高估值、高熱度但基本面支撐薄弱的標的（avoid/reject 候選）
- 投資人普遍低估風險的標的
- 可以作為避險的標的（防禦股、低相關性資產）
`,
      teamLeader: `
整合各代理人的風險觀點，確保最終建議風控優先：
- 下行風險（最壞情境下的損失幅度）
- 停損紀律（明確的停損條件，不模糊）
- 部位建議（若共識支持行動，建議從小部位開始）
- 風險/報酬比（只有風報比 > 2:1 才值得行動）
`,
    },
  };

  const intro = ROLE_INTROS[role] ?? "";
  const focus = ROLE_FOCUS[role]?.[agentType] ?? "";

  if (!intro && !focus) return "";

  return `\n## 🎯 本團隊專業角色：${role.toUpperCase()}\n${intro}${focus}`.trim();
}
```

---

## Step 3: Pass `teamRole` into `PromptIdentity` in `team.ts`

In `src/lib/analysis/pipeline/team.ts`, find the identity object construction (lines ~294–300):

```typescript
// BEFORE:
const identity: PromptIdentity = {
  agentName: params.team.team_leader,
  teamName: params.team.team_name,
  teamLeader: params.team.team_leader,
  divisionName: params.division.name,
  divisionManager: params.division.manager_name
};
```

```typescript
// AFTER:
const identity: PromptIdentity = {
  agentName: params.team.team_leader,
  teamName: params.team.team_name,
  teamLeader: params.team.team_leader,
  divisionName: params.division.name,
  divisionManager: params.division.manager_name,
  teamRole: params.team.team_role, // ADD THIS
};
```

---

## Step 4: Add `getRoleGuidance` injection to each prompt builder

Import `getRoleGuidance` in each prompt file:

```typescript
import { getRoleGuidance } from "@/lib/analysis/prompts/common";
```

Then inject into each prompt builder. The pattern for every prompt is the same: add the role guidance block **after** the opening `roleLine()` identity section and **before** the main analysis framework.

### 4a. `src/lib/analysis/prompts/market-review.ts`

Find `buildMarketReviewPrompt(identity, dataPackage)`. After `${roleLine(identity, "...")}`, add:

```typescript
${getRoleGuidance(identity.teamRole, "marketReview")}
```

### 4b. `src/lib/analysis/prompts/portfolio-review.ts`

Find `buildPortfolioReviewPrompt(identity, dataPackage)`. After `${roleLine(identity, "...")}`, add:

```typescript
${getRoleGuidance(identity.teamRole, "portfolioReview")}
```

### 4c. `src/lib/analysis/prompts/mission-analysis.ts`

Find `buildMissionAnalysisPrompt(identity, dataPackage)`. After `${roleLine(identity, "...")}`, add:

```typescript
${getRoleGuidance(identity.teamRole, "missionAnalysis")}
```

### 4d. `src/lib/analysis/prompts/market-scan.ts`

Find `buildMarketScanPrompt(identity, dataPackage)`. After `${roleLine(identity, "...")}`, add:

```typescript
${getRoleGuidance(identity.teamRole, "marketScan")}
```

### 4e. `src/lib/analysis/prompts/team-leader.ts`

Find `buildTeamLeaderPrompt(identity, ...)`. After `${roleLine(identity, "...")}`, add:

```typescript
${getRoleGuidance(identity.teamRole, "teamLeader")}
```

---

## Step 5: Update `division_teams` table in Supabase

The `team_role` field already exists in the schema. You need to **set the values** for each team in Supabase.

Run the following SQL in Supabase SQL editor. **First**, query your actual team names:

```sql
SELECT id, team_name, division_id FROM division_teams ORDER BY sort_order;
```

Then assign roles based on sort order (each division has 5 teams, assign one role per team):

```sql
-- Assign roles by sort_order within each division
-- Each division gets all 5 roles, one per team
UPDATE division_teams SET team_role = 'technical'   WHERE sort_order = 1;
UPDATE division_teams SET team_role = 'fundamental' WHERE sort_order = 2;
UPDATE division_teams SET team_role = 'macro'       WHERE sort_order = 3;
UPDATE division_teams SET team_role = 'sentiment'   WHERE sort_order = 4;
UPDATE division_teams SET team_role = 'risk'        WHERE sort_order = 5;
```

**Verify**:
```sql
SELECT team_name, team_role, sort_order FROM division_teams ORDER BY sort_order;
```

---

## Step 6: Update division manager to acknowledge team roles

In `src/lib/analysis/prompts/division-manager.ts`, in the team report summary section, note which role each team represents so the division manager knows each team's lens when synthesizing:

Find where team reports are listed and add role context:

```typescript
// In the team reports listing, add role label
// Look for something like: teamReports.map(report => `Team: ${report.teamName}...`)
// Change to include team role from report

// If TeamReport type includes team_role, use it directly.
// If not, the division manager won't know roles — that's okay for now.
// The important thing is each team's OUTPUT already reflects their specialization.
```

**Note**: The division manager doesn't need explicit role labels — it will naturally see different types of analysis from each team (one focused on technicals, one on fundamentals, etc.) and synthesize them. This is the intended behavior.

---

## Verification

After applying:

1. Run `npx tsc --noEmit` — confirm no type errors.
2. Update `division_teams` in Supabase (Step 5 SQL).
3. Run a mission. In `pipeline_agent_runs`, check the prompt for each team agent — should see "🎯 本團隊專業角色：TECHNICAL" (or whichever role) in the prompt.
4. Compare team reports from different teams — they should have visibly different emphasis (one focused on RSI/MACD, one on valuation, etc.).
5. The division manager's synthesis should naturally incorporate these different viewpoints.

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/lib/analysis/prompts/common.ts` | Add `teamRole?` to `PromptIdentity` + add `getRoleGuidance()` function |
| `src/lib/analysis/pipeline/team.ts` | Add `teamRole: params.team.team_role` to identity object |
| `src/lib/analysis/prompts/market-review.ts` | Add `${getRoleGuidance(identity.teamRole, "marketReview")}` |
| `src/lib/analysis/prompts/portfolio-review.ts` | Add `${getRoleGuidance(identity.teamRole, "portfolioReview")}` |
| `src/lib/analysis/prompts/mission-analysis.ts` | Add `${getRoleGuidance(identity.teamRole, "missionAnalysis")}` |
| `src/lib/analysis/prompts/market-scan.ts` | Add `${getRoleGuidance(identity.teamRole, "marketScan")}` |
| `src/lib/analysis/prompts/team-leader.ts` | Add `${getRoleGuidance(identity.teamRole, "teamLeader")}` |
| **Supabase DB** | Run SQL to set `team_role` values for each team |
