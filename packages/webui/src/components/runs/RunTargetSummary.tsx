import React from "react"
import type { RootRun } from "../../contracts/runs"
import { describeRunTargetSelectionReason } from "../../lib/run-target"
import { useUiI18n } from "../../lib/ui-i18n"
import { RunTargetBadge } from "./RunTargetBadge"

export function RunTargetSummary({ run }: { run: RootRun }) {
  const { text, displayText } = useUiI18n()
  const reason = describeRunTargetSelectionReason(run, text)

  return (
    <div className="space-y-1">
      <RunTargetBadge targetId={run.targetId} targetLabel={run.targetLabel} />
      <div className="text-[11px] leading-5 text-stone-500">
        {displayText(reason)}
      </div>
    </div>
  )
}
