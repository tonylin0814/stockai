"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateAccountProfile, updatePasswordAndSignOut } from "@/app/account-actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Profile = {
  nickname: string;
  username: string;
};

function SaveProfileButton({ show }: { show: boolean }) {
  const { pending } = useFormStatus();

  if (!show && !pending) return null;

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中..." : "保存"}
    </Button>
  );
}

function PasswordButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "修改中..." : "確認"}
    </Button>
  );
}

export function AccountSettingsForm({ profile }: { profile: Profile }) {
  const [state, action] = useFormState(updateAccountProfile, null);
  const [nickname, setNickname] = useState(profile.nickname);
  const [username, setUsername] = useState(profile.username);
  const [baseline, setBaseline] = useState(profile);
  const currentKey = useMemo(() => `${nickname}|${username}`, [nickname, username]);
  const baselineKey = useMemo(() => `${baseline.nickname}|${baseline.username}`, [baseline]);
  const changed = currentKey !== baselineKey;

  useEffect(() => {
    if (state?.success && state.profile) {
      setBaseline(state.profile);
      setNickname(state.profile.nickname);
      setUsername(state.profile.username);
    }
  }, [state]);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">帳號資料</h2>
      <form action={action} className="mt-4 space-y-4">
        <FormField label="我的昵稱" htmlFor="nickname">
          <Input
            id="nickname"
            name="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            required
          />
        </FormField>
        <FormField label="用戶名稱" htmlFor="username">
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            pattern="^\S+$"
            title="用戶名稱不能有空格"
            required
          />
        </FormField>
        <p className="text-sm text-slate-500">用戶名稱不能有空格，以後登入會使用這個名稱。</p>
        {state?.success ? <p className="text-sm text-green-700">帳號資料已保存。</p> : null}
        {state?.error ? <p className="text-sm text-red-700">{String(state.error)}</p> : null}
        <div className="flex justify-end">
          <SaveProfileButton show={changed} />
        </div>
      </form>

      <form
        action={updatePasswordAndSignOut}
        className="mt-8 space-y-4 border-t border-slate-200 pt-5"
        onSubmit={(event) => {
          if (!window.confirm("密碼修改後會自動登出，確定要修改嗎？")) {
            event.preventDefault();
          }
        }}
      >
        <h3 className="text-lg font-semibold text-slate-950">修改密碼</h3>
        <FormField label="新密碼" htmlFor="password">
          <Input id="password" name="password" type="password" minLength={6} required />
        </FormField>
        <div className="flex justify-end">
          <PasswordButton />
        </div>
      </form>
    </section>
  );
}
