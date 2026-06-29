import Link from "next/link";
import { LogIn } from "lucide-react";
import { signIn } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";

type LoginPageProps = {
  searchParams?: {
    error?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <div className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-slate-950">登入</h1>
        <p className="text-sm text-slate-600">請使用電子郵件與密碼進入系統。</p>
      </div>
      {searchParams?.error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </div>
      ) : null}
      <form action={signIn} className="space-y-4">
        <FormField label="電子郵件" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </FormField>
        <FormField label="密碼" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </FormField>
        <Button type="submit" className="w-full">
          <LogIn className="h-4 w-4" />
          登入
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        還沒有帳號？{" "}
        <Link href="/register" className="font-medium text-slate-950 underline">
          建立帳號
        </Link>
      </p>
    </div>
  );
}
