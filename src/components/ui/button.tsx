import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
        variant === "secondary" &&
          "border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
        variant === "ghost" &&
          "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
        variant === "danger" &&
          "border-red-700 bg-red-700 text-white hover:bg-red-800",
        size === "sm" && "h-8 px-3",
        size === "md" && "h-10 px-4",
        size === "icon" && "h-9 w-9",
        className
      )}
      {...props}
    />
  );
}
