import * as React from "react"
import {
  inferExecutorFromDescription,
  type ExecutorInferenceResult,
} from "../../lib/executor-inference"
import { useUiI18n } from "../../lib/ui-i18n"

export interface ExecutorUnderstandingPanelProps {
  name: string
  description: string
  inference?: ExecutorInferenceResult
  titleKo?: string
  titleEn?: string
  lowConfidenceMessageKo?: string
  lowConfidenceMessageEn?: string
  confirmDisabled?: boolean
  onConfirm?: () => void
}

export function ExecutorUnderstandingPanel({
  name,
  description,
  inference,
  titleKo,
  titleEn,
  lowConfidenceMessageKo,
  lowConfidenceMessageEn,
  confirmDisabled = false,
  onConfirm,
}: ExecutorUnderstandingPanelProps) {
  const { text } = useUiI18n()
  const resolvedInference = React.useMemo(
    () => inference ?? inferExecutorFromDescription({ name, description }),
    [description, inference, name],
  )

  return (
    <section
      className="rounded-lg border border-stone-200 bg-white p-3"
      data-testid="executor-understanding-panel"
      data-runtime-mode={resolvedInference.runtimeMode}
      data-confidence={resolvedInference.confidence}
      data-ready-for-auto-run={resolvedInference.readyForAutoRun}
    >
      <div>
        <div>
          <div className="text-xs font-semibold text-stone-950">
            {text(titleKo ?? "메인 에이전트가 이해한 내용", titleEn ?? "What the main agent understood")}
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {text(resolvedInference.summaryKo, resolvedInference.summaryEn)}
          </p>
        </div>
      </div>

      {resolvedInference.requiresClarification ? (
        <div
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-800"
          data-testid="executor-understanding-low-confidence"
        >
          {text(
            lowConfidenceMessageKo ?? "설명이 짧아 요청 처리 중 메인 에이전트가 필요한 내용을 더 물어볼 수 있습니다.",
            lowConfidenceMessageEn ?? "The description is short, so the main agent may ask for missing details while handling a request.",
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="h-8 rounded-md bg-stone-900 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="executor-understanding-confirm"
        >
          {text("저장", "Save")}
        </button>
      </div>
    </section>
  )
}
