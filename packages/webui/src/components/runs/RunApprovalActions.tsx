import { useState } from "react"
import { sendWs } from "../../api/ws"
import { UserRecoveryNotice } from "../UserRecoveryNotice"
import {
  buildApprovalParamSummary,
  buildApprovalScopeSummary,
  describeApprovalToolName,
} from "../../lib/approval-preview"
import { BEGINNER_ACTION_BUTTON_CLASS, buildBeginnerApprovalCard } from "../../lib/beginner-workspace"
import { useUiI18n } from "../../lib/ui-i18n"
import type { UserRecoveryProjection } from "../../lib/user-recovery"
import type { ApprovalRequest } from "../../stores/chat"
import { useUiModeStore } from "../../stores/uiMode"

function beginnerButtonClass(tone: "approve" | "once" | "deny"): string {
  const toneClass = tone === "approve"
    ? "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500"
    : tone === "once"
      ? "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
      : "bg-white text-stone-700 ring-1 ring-inset ring-stone-200 hover:bg-stone-50 focus:ring-stone-500"
  return `${BEGINNER_ACTION_BUTTON_CLASS} ${toneClass}`
}

export function RunApprovalActions({ approval }: { approval: ApprovalRequest }) {
  const isScreenConfirmation = approval.kind === "screen_confirmation"
  const mode = useUiModeStore((state) => state.mode)
  const { text, displayText, language } = useUiI18n()
  const [submittedDecision, setSubmittedDecision] = useState<"allow_run" | "allow_once" | "deny" | null>(null)
  const [recovery, setRecovery] = useState<UserRecoveryProjection | null>(null)
  const beginnerCard = buildBeginnerApprovalCard(approval, language)
  const approvalToolLabel = describeApprovalToolName(approval.toolName, text)
  const approvalParamSummary = buildApprovalParamSummary(approval.params, text)
  const approvalScopeSummary = buildApprovalScopeSummary({
    toolName: approval.toolName,
    params: approval.params,
    expiresAt: approval.expiresAt,
  }, text)

  function respond(decision: "allow_run" | "allow_once" | "deny") {
    if (submittedDecision) return
    setSubmittedDecision(decision)
    setRecovery(null)
    const sent = sendWs({
      type: "approval.respond",
      approvalId: approval.approvalId,
      runId: approval.runId,
      toolName: approval.toolName,
      decision,
    })
    if (!sent) {
      setSubmittedDecision(null)
      setRecovery({
        kind: "unavailable",
        reasonCode: "network_unavailable",
        messageKey: "unavailable",
        action: "refresh_state",
        actionLabelKey: "refresh_state",
      })
    }
  }

  if (mode === "beginner") {
    return (
      <section id="approval" className="max-h-[70vh] space-y-4 overflow-y-auto rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-4" aria-live="polite">
        {recovery ? <UserRecoveryNotice projection={recovery} subject="chat" text={text} /> : null}
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{beginnerCard.title}</div>
          <p className="mt-2 text-sm leading-6 text-stone-700">{beginnerCard.summary}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-stone-600">
            {approvalScopeSummary.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {beginnerCard.actions.map((action) => (
            <button
              key={action.decision}
              type="button"
              aria-label={action.ariaLabel}
              disabled={submittedDecision !== null}
              onClick={() => respond(action.decision)}
              className={`${beginnerButtonClass(action.tone)} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
      {recovery ? <UserRecoveryNotice projection={recovery} subject="chat" text={text} /> : null}
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
        {isScreenConfirmation ? text("준비 확인 필요", "Confirmation needed") : text("승인 필요", "Approval needed")}
      </div>
      <div className="text-sm font-semibold text-stone-900">{approvalToolLabel}</div>
      <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-stone-700">
        {approvalScopeSummary.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {approval.guidance ? (
        <div className="rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-stone-700">
          {displayText(approval.guidance)}
        </div>
      ) : null}
      <div className="rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-stone-700">
        <div className="font-semibold text-stone-800">{text("승인 내용 요약", "Approval summary")}</div>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {approvalParamSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2">
        <button
          type="button"
          aria-label={isScreenConfirmation ? text("준비 완료 후 현재 요청 전체 진행", "Ready and continue the entire current request") : text("현재 요청 전체 승인", "Approve the entire current request")}
          disabled={submittedDecision !== null}
          onClick={() => respond("allow_run")}
          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isScreenConfirmation ? text("준비 완료 후 전체 진행", "Ready, continue all") : text("이 요청 전체 승인", "Approve entire request")}
        </button>
        <button
          type="button"
          aria-label={isScreenConfirmation ? text("준비 완료 후 이번 단계만 진행", "Ready and continue this step only") : text("이번 단계만 승인", "Approve this step only")}
          disabled={submittedDecision !== null}
          onClick={() => respond("allow_once")}
          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isScreenConfirmation ? text("이번 단계만 진행", "Continue this step only") : text("이번 단계만 승인", "Approve this step only")}
        </button>
        <button
          type="button"
          aria-label={isScreenConfirmation ? text("준비 안 됨으로 요청 취소", "Cancel because the screen is not ready") : text("승인을 거부하고 요청 취소", "Deny approval and cancel the request")}
          disabled={submittedDecision !== null}
          onClick={() => respond("deny")}
          className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isScreenConfirmation ? text("준비 안 됨, 요청 취소", "Not ready, cancel request") : text("거부 후 취소", "Deny and cancel")}
        </button>
      </div>
    </div>
  )
}
