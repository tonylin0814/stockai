"use client";

import type { ComponentType } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PendingSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  icon?: ComponentType<{ className?: string }>;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  className?: string;
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  icon: Icon,
  variant = "primary",
  size = "md",
  className
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

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
