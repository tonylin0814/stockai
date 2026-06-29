import { AlertsPanelClient } from "@/components/alerts-panel-client";
import { refreshAndGetAlerts, type Alert } from "@/lib/alerts/generate";

export default async function AlertsPanel({ userId }: { userId: string }) {
  let alerts: Alert[] = [];

  try {
    alerts = await refreshAndGetAlerts(userId);
  } catch {
    return null;
  }

  if (alerts.length === 0) return null;

  return <AlertsPanelClient initialAlerts={alerts} />;
}
