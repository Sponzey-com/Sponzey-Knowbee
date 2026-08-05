import React from "react"
import type { RootRun } from "../../contracts/runs"
import { describeRunTargetSelectionReason } from "../../lib/run-target"
import { useUiI18n } from "../../lib/ui-i18n"
import { hasUserFacingRunTargetLabel, RunTargetBadge } from "./RunTargetBadge"

export function RunTargetSummary({ run }: { run: RootRun }) {
  const { text, displayText, language } = useUiI18n()
  const hasVisibleTarget = hasUserFacingRunTargetLabel(run.targetId, run.targetLabel, language)
  const reason = hasVisibleTarget
    ? describeRunTargetSelectionReason(run, text)
    : text("실행 대상을 아직 확정하지 않았습니다.", "Execution target is not selected yet.")

  return (
    <div className="space-y-1">
      <RunTargetBadge targetId={run.targetId} targetLabel={run.targetLabel} />
      <div className="text-[11px] leading-5 text-stone-500">
        {displayText(reason)}
      </div>
    </div>
  )
}
