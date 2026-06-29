import * as React from "react";
import { Label } from "@/components/ui/label";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
};

export function FormField({ label, htmlFor, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
