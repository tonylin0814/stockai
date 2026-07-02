import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className={cn("w-full min-w-max text-base leading-7", className)} {...props} />
    </div>
  );
}

export function Th({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-slate-200 bg-slate-50 px-5 py-3.5 text-left font-semibold text-slate-800",
        className
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-slate-100 px-5 py-3.5 align-top text-slate-800", className)}
      {...props}
    />
  );
}
