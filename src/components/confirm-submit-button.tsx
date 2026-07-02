"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmSubmitButtonProps = {
  idleLabel: string;
  confirmLabel: string;
  confirmMessage?: string;
  icon?: "trash" | "x";
  variant?: "danger" | "ghost";
};

export function ConfirmSubmitButton({
  idleLabel,
  confirmLabel,
  confirmMessage,
  icon = "trash",
  variant = "danger"
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;

    const id = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const button = (
    <Button
      type={confirming ? "submit" : "button"}
      variant={variant}
      size="icon"
      disabled={pending}
      aria-label={confirming ? confirmLabel : idleLabel}
      title={confirming ? confirmLabel : idleLabel}
      className={confirming ? "ring-2 ring-red-300 ring-offset-1" : undefined}
      onClick={(event) => {
        if (!confirming) {
          event.preventDefault();
          setConfirming(true);
        }
      }}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : confirming ? (
        <Check className="h-4 w-4" />
      ) : icon === "x" ? (
        <XCircle className="h-4 w-4" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );

  if (!confirmMessage) {
    return button;
  }

  return (
    <span className="inline-flex items-center gap-2">
      {confirming ? (
        <span className="max-w-48 text-xs font-medium leading-4 text-red-700">
          {confirmMessage}
        </span>
      ) : null}
      {button}
    </span>
  );
}
