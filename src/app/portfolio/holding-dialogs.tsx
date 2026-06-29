"use client";

import { Edit, Plus } from "lucide-react";
import { createHolding, updateHolding } from "@/app/actions";
import { HoldingForm, type HoldingFormValue } from "@/app/portfolio/holding-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function AddHoldingDialog() {
  return (
    <Dialog
      title="新增持股"
      trigger={
        <Button type="button">
          <Plus className="h-4 w-4" />
          新增持股
        </Button>
      }
    >
      {(close) => <HoldingForm action={createHolding} onSuccess={close} />}
    </Dialog>
  );
}

export function EditHoldingDialog({ holding }: { holding: HoldingFormValue }) {
  return (
    <Dialog
      title="編輯持股"
      trigger={
        <Button type="button" variant="secondary" size="icon" aria-label="Edit" title="Edit">
          <Edit className="h-4 w-4" />
        </Button>
      }
    >
      {(close) => <HoldingForm action={updateHolding} holding={holding} onSuccess={close} />}
    </Dialog>
  );
}
