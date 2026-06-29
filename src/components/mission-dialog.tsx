"use client";

import { Plus } from "lucide-react";
import { MissionForm } from "@/components/mission-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function MissionDialog() {
  return (
    <Dialog
      title="新增任務"
      trigger={
        <Button type="button">
          <Plus className="h-4 w-4" />
          新增任務
        </Button>
      }
    >
      {(close) => <MissionForm onSaved={close} />}
    </Dialog>
  );
}
