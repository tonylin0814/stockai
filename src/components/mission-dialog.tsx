"use client";

import { Plus } from "lucide-react";
import { MissionForm, type MissionLinkOption } from "@/components/mission-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function MissionDialog({
  portfolioOptions,
  watchlistOptions
}: {
  portfolioOptions: MissionLinkOption[];
  watchlistOptions: MissionLinkOption[];
}) {
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
      {(close) => (
        <MissionForm
          portfolioOptions={portfolioOptions}
          watchlistOptions={watchlistOptions}
          onSaved={close}
        />
      )}
    </Dialog>
  );
}
