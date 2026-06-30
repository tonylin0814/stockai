import Link from "next/link";
import { signUp } from "@/app/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";

type RegisterPageProps = {
  searchParams?: {
    error?: string;
  };
};

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  return (
    <div className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-slate-950">註冊</h1>
        <p className="text-sm text-slate-600">建立家庭投資決策系統帳號。</p>
      </div>
      {searchParams?.error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </div>
      ) : null}
      <form action={signUp} className="space-y-4">
        <FormField label="顯示名稱" htmlFor="display_name">
          <Input id="display_name" name="display_name" required />
        </FormField>
        <FormField label="電子郵件" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </FormField>
        <FormField label="密碼" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </FormField>
        <PendingSubmitButton
          idleLabel="建立帳號"
          pendingLabel="建立中..."
          icon="user-plus"
          className="w-full"
        />
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        已經有帳號？{" "}
        <Link href="/login" className="font-medium text-slate-950 underline">
          前往登入
        </Link>
      </p>
    </div>
  );
}
