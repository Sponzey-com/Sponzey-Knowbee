import type { RootRun } from "../contracts/runs"

type TextFn = (ko: string, en: string) => string

function textOrNull(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function targetSelectionStepSummary(run: RootRun): string | null {
  const summary = run.steps.find((step) => step.key === "target_selected")?.summary
  return textOrNull(summary)
}

function latestTargetEvent(run: RootRun): string | null {
  const match = [...run.recentEvents]
    .sort((left, right) => right.at - left.at)
    .find((event) => /대상을 선택했습니다|기본 실행 대상을 선택했습니다|모델을 선택했습니다/.test(event.label))
  return textOrNull(match?.label)
}

export function describeRunTargetSelectionReason(run: RootRun, text: TextFn): string {
  const stepSummary = targetSelectionStepSummary(run)
  if (stepSummary) return stepSummary

  const eventSummary = latestTargetEvent(run)
  if (eventSummary) return eventSummary

  if (!textOrNull(run.targetId) && !textOrNull(run.targetLabel)) {
    return text("실행 대상을 아직 확정하지 않았습니다.", "Execution target is not selected yet.")
  }

  if ((run.targetId ?? "").startsWith("provider:")) {
    return text("선택한 AI 실행 대상을 사용했습니다.", "The selected AI target was used.")
  }

  const haystack = `${run.targetId ?? ""} ${run.targetLabel ?? ""}`.toLowerCase()
  if (/yeonjang|extension|연장/.test(haystack)) {
    return text("선택한 연장을 대상으로 실행했습니다.", "Executed against the selected extension.")
  }

  return text("선택한 실행 대상을 사용했습니다.", "Executed using the selected target.")
}
