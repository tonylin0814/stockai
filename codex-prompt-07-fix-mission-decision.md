# Codex Task: Fix "模型分析對照" Showing Insufficient Data

## Root Cause

The mission detail page (模型分析對照 section) reads these fields from `division_decisions.mission_decision`:
- `missionDecision.summary`
- `missionDecision.reason`
- `missionDecision.keyRisks`
- `missionDecision.conditionsToAct`

But `DIVISION_DECISION_JSON_SCHEMA` in `schemas.ts` shows `"missionDecision": {}` — a completely empty object. The AI sees this example and produces `{}` or random field names. The UI reads empty values and shows "—".

Two files need fixing.

---

## Fix 1: Update `src/lib/analysis/schemas.ts`

Find this line:
```typescript
  "missionDecision": {},
```

Replace with:
```typescript
  "missionDecision": {
    "missionTitle": "每日例行分析",
    "suggestion": "buy | wait | hold | reduce | sell | reject",
    "summary": "任務分析綜合摘要",
    "reason": "採取此建議的主要理由",
    "buyZone": "建議買進區間（若適用）",
    "targetPrice": "目標價（若適用）",
    "stopLoss": "停損點（若適用）",
    "timeHorizon": "short | swing | long",
    "confidence": 0,
    "keyRisks": ["主要風險"],
    "conditionsToAct": ["需要成立的條件才採取行動"]
  },
```

---

## Fix 2: Update `src/lib/analysis/prompts/division-manager.ts`

In the **Phase 5: Top Recommendations 精選** section (or add a new Phase after it), add explicit instructions for `missionDecision`.

Add this section to the prompt, after the Phase 5 block:

```
**Phase 6：Mission Decision 整合**

你必須輸出 missionDecision 欄位，整合所有 team 的 missionAnalysis 結論。

從 5 個 team reports 中，讀取每個 team 的 missionAnalysis 欄位，然後：
- missionTitle：用一句話描述今日最重要的分析任務（30字以內）
- suggestion：整合後的行動建議（buy/wait/hold/reduce/sell/reject）
- summary：2-3 句，說明今日最需要關注的問題是什麼，為什麼
- reason：你選擇此 suggestion 的具體理由（引用至少 2 個 team 的觀點）
- buyZone：若 suggestion 是 buy/small_buy，給出具體買進區間；否則填 "N/A"
- targetPrice：目標價；否則填 "N/A"
- stopLoss：停損點；否則填 "N/A"
- timeHorizon：short（1-4週）/ swing（1-3個月）/ long（6個月以上）
- confidence：0-100
- keyRisks：列出 2-4 個最主要的下行風險
- conditionsToAct：列出 2-3 個需要成立才採取行動的具體條件
```

---

## Verification

No TypeScript changes needed — `missionDecision` uses `FlexibleRecordSchema` which accepts any object. The schema string change in `schemas.ts` only affects what the AI reads as an example, not Zod validation.

After applying, run a test mission. The 模型分析對照 table should now show meaningful content in 摘要、理由、主要風險、行動條件 columns instead of "—".
