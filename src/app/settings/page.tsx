import { createSupabaseServerClient } from "@/lib/supabase/server";
import SettingsForm from "@/app/settings/settings-form";
import { AccountSettingsForm } from "@/app/settings/account-settings-form";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: { passwordError?: string };
}) {
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
  const { data: profile } = await supabase
    .from("stocks_profiles")
    .select("nickname, username, display_name")
    .eq("id", user.id)
    .maybeSingle();
  const nickname =
    String(profile?.nickname ?? profile?.display_name ?? "").trim() ||
    String(user.email ?? "").split("@")[0] ||
    "";
  const username = String(profile?.username ?? "").trim();

  return (
    <div className="w-full max-w-xl space-y-8">
      <h1 className="text-2xl font-semibold text-slate-950">設定</h1>
      {searchParams?.passwordError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          密碼修改失敗，請確認新密碼至少 6 個字。
        </div>
      ) : null}
      <AccountSettingsForm profile={{ nickname, username }} />
      <SettingsForm settings={settings} />
    </div>
  );
}
