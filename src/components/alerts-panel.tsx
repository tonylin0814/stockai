import { AlertTriangle, CheckCircle2, Clock, TrendingDown, TrendingUp } from "lucide-react";
import DismissAlertButton from "@/components/dismiss-alert-button";
import { refreshAndGetAlerts, type Alert } from "@/lib/alerts/generate";

const ALERT_ICONS: Record<string, React.ReactNode> = {
  price_in_buy_zone: <TrendingUp className="h-4 w-4 text-green-600" />,
  target_hit: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  stop_loss_hit: <TrendingDown className="h-4 w-4 text-red-600" />,
  data_stale: <Clock className="h-4 w-4 text-amber-600" />,
  api_failure: <AlertTriangle className="h-4 w-4 text-amber-600" />
};

const ALERT_BG: Record<string, string> = {
  price_in_buy_zone: "bg-green-50 border-green-200",
  target_hit: "bg-emerald-50 border-emerald-200",
  stop_loss_hit: "bg-red-50 border-red-200",
  data_stale: "bg-amber-50 border-amber-200",
  api_failure: "bg-amber-50 border-amber-200"
};

export default async function AlertsPanel({ userId }: { userId: string }) {
  let alerts: Alert[] = [];

  try {
    alerts = await refreshAndGetAlerts(userId);
  } catch {
    return null;
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-slate-700">提醒 ({alerts.length})</h2>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start justify-between gap-3 rounded-md border p-3 ${
            ALERT_BG[alert.alert_type] ?? "bg-slate-50 border-slate-200"
          }`}
        >
          <div className="flex min-w-0 items-start gap-2">
            {ALERT_ICONS[alert.alert_type]}
            <p className="break-words text-sm text-slate-800">{alert.message}</p>
          </div>
          <DismissAlertButton alertId={alert.id} />
        </div>
      ))}
    </div>
  );
}
