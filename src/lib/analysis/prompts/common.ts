import type { DailyDataPackage } from "@/lib/analysis/data-package";

export type PromptIdentity = {
  agentName: string;
  teamName: string;
  teamLeader: string;
  divisionName: string;
  divisionManager: string;
};

export const DATA_QUALITY_RULE =
  "若資料品質為 missing 或 stale，信心分數上限為 60。若關鍵資料為 missing，action 必須是 wait 或 insufficient_data，不得給出 buy 或 small_buy。";

export const SKEPTIC_RULE =
  "你必須至少指出一個可能的錯誤或風險。若真的找不到，必須明確說明為什麼沒有問題。";

export function dataPackageJson(dataPackage: DailyDataPackage) {
  return JSON.stringify(dataPackage, null, 2);
}

export function roleLine(identity: PromptIdentity, role: string) {
  return `你是 ${identity.agentName}，${identity.teamName} 的 ${role}。Division：${identity.divisionName}，division manager：${identity.divisionManager}。`;
}
