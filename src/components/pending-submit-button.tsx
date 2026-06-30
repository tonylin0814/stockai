"use client";

import { useFormStatus } from "react-dom";
import { Filter, Loader2, LogIn, LogOut, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IconName = "filter" | "login" | "logout" | "refresh" | "user-plus";

type PendingSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  className?: string;
};

const icons: Record<IconName, typeof RefreshCw> = {
  filter: Filter,
  login: LogIn,
  logout: LogOut,
  refresh: RefreshCw,
  "user-plus": UserPlus
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  icon: iconName,
  variant = "primary",
  size = "md",
  className
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const Icon = iconName ? icons[iconName] : null;

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      aria-busy={pending}
      className={cn(className)}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : Icon ? (
        <Icon className="h-4 w-4" />
      ) : null}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
