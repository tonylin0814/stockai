"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateUserSettings } from "@/app/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Settings = {
  max_single_position_pct?: number | null;
  max_sector_exposure_pct?: number | null;
  max_market_exposure_pct?: number | null;
  default_stop_loss_pct?: number | null;
  min_consensus_level?: string | null;
  min_confidence_for_action?: number | null;
} | null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "儲存中..." : "儲存設定"}</Button>;
}

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useFormState(updateUserSettings, null);

  return (
    <form action={action} className="space-y-4">
      <FormField label="最大單一部位 (%)" htmlFor="max_single_position_pct">
        <Input id="max_single_position_pct" name="max_single_position_pct" type="number" min="1" max="100" defaultValue={settings?.max_single_position_pct ?? 15} required />
      </FormField>
      <FormField label="最大板塊曝險 (%)" htmlFor="max_sector_exposure_pct">
        <Input id="max_sector_exposure_pct" name="max_sector_exposure_pct" type="number" min="1" max="100" defaultValue={settings?.max_sector_exposure_pct ?? 35} required />
      </FormField>
      <FormField label="最大市場曝險 (%)" htmlFor="max_market_exposure_pct">
        <Input id="max_market_exposure_pct" name="max_market_exposure_pct" type="number" min="1" max="100" defaultValue={settings?.max_market_exposure_pct ?? 70} required />
      </FormField>
      <FormField label="預設停損 (%)" htmlFor="default_stop_loss_pct">
        <Input id="default_stop_loss_pct" name="default_stop_loss_pct" type="number" min="1" max="50" defaultValue={settings?.default_stop_loss_pct ?? 10} required />
      </FormField>
      <FormField label="最低共識級別" htmlFor="min_consensus_level">
        <Select id="min_consensus_level" name="min_consensus_level" defaultValue={settings?.min_consensus_level ?? "strong"} required>
          <option value="strong">strong（強共識）</option>
          <option value="weak">weak（弱共識）</option>
        </Select>
      </FormField>
      <FormField label="最低信心度" htmlFor="min_confidence_for_action">
        <Input id="min_confidence_for_action" name="min_confidence_for_action" type="number" min="50" max="100" defaultValue={settings?.min_confidence_for_action ?? 70} required />
      </FormField>
      {state?.success ? <p className="text-sm text-green-700">設定已儲存。</p> : null}
      {state?.error ? <p className="text-sm text-red-700">{String(state.error)}</p> : null}
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
