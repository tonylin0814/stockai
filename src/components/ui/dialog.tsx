"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DialogProps = {
  trigger: React.ReactNode;
  title: string;
  children: React.ReactNode;
};

export function Dialog({ trigger, title, children }: DialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div
            className={cn(
              "max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md bg-white p-5 shadow-xl"
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="關閉"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
