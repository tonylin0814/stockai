import { createSupabaseServerClient } from "@/lib/supabase/server";
import SettingsForm from "@/app/settings/settings-form";

export default async function SettingsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: settings } = await supabase
    .from("stocks_user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="w-full max-w-xl space-y-8">
      <h1 className="text-2xl font-semibold text-slate-950">設定</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
