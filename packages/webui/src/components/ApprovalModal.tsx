import { useEffect, useMemo, useState } from "react"
import { sendWs } from "../api/ws"
import { UserRecoveryNotice } from "./UserRecoveryNotice"
import {
  approvalRemainingSeconds,
  buildApprovalParamSummary,
  buildApprovalScopeSummary,
  describeApprovalToolName,
} from "../lib/approval-preview"
import { resolvePendingInteractionForSession } from "../lib/pending-interactions"
import { useUiI18n } from "../lib/ui-i18n"
import type { UserRecoveryProjection } from "../lib/user-recovery"
import { useChatStore } from "../stores/chat"
import { useRunsStore } from "../stores/runs"

export function ApprovalModal() {
  const { pendingApproval, sessionId } = useChatStore()
  const runs = useRunsStore((state) => state.runs)
  const [countdown, setCountdown] = useState(60)
  const [submitted, setSubmitted] = useState(false)
  const [recovery, setRecovery] = useState<UserRecoveryProjection | null>(null)
  const { text, language } = useUiI18n()
  const resolvedApproval = useMemo(
    () => resolvePendingInteractionForSession(runs, sessionId, pendingApproval, language),
    [runs, sessionId, pendingApproval, language],
  )
  const isScreenConfirmation = resolvedApproval?.kind === "screen_confirmation"
  const approvalToolLabel = resolvedApproval ? describeApprovalToolName(resolvedApproval.toolName, text) : ""
  const approvalParamSummary = resolvedApproval ? buildApprovalParamSummary(resolvedApproval.params, text) : []
  const approvalScopeSummary = resolvedApproval
    ? buildApprovalScopeSummary({
        toolName: resolvedApproval.toolName,
        params: resolvedApproval.params,
        expiresAt: resolvedApproval.expiresAt,
      }, text)
    : []

  useEffect(() => {
    if (!resolvedApproval || isScreenConfirmation) return
    setSubmitted(false)
    setRecovery(null)
    setCountdown(approvalRemainingSeconds(resolvedApproval.expiresAt) ?? 60)
    const interval = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [resolvedApproval?.approvalId, resolvedApproval?.runId, isScreenConfirmation])

  if (!resolvedApproval || isScreenConfirmation) return null

  function respond(decision: "allow_once" | "allow_run" | "deny") {
    if (submitted) return
    setSubmitted(true)
    setRecovery(null)
    const sent = sendWs({ type: "approval.respond", approvalId: resolvedApproval.approvalId, runId: resolvedApproval.runId, toolName: resolvedApproval.toolName, decision })
    if (!sent) {
      setSubmitted(false)
      setRecovery({
        kind: "unavailable",
        reasonCode: "network_unavailable",
        messageKey: "unavailable",
        action: "refresh_state",
        actionLabelKey: "refresh_state",
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-dialog-title"
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
      >
        {recovery ? <UserRecoveryNotice projection={recovery} subject="chat" text={text} /> : null}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-2xl">⚠️</span>
          <h2 id="approval-dialog-title" className="text-lg font-bold text-gray-800">{text("외부 도구 실행 승인 필요", "External tool execution approval required")}</h2>
          <span className="ml-auto text-sm text-gray-400">{countdown}{text("초", "s")}</span>
        </div>
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">{text("외부 도구:", "External tool:")}</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800">{approvalToolLabel}</span>
          </div>
          {resolvedApproval.guidance ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {resolvedApproval.guidance}
            </div>
          ) : null}
          <ul className="rounded border border-gray-200 px-4 py-3 text-xs leading-5 text-gray-700">
            {approvalScopeSummary.map((line) => (
              <li key={line} className="list-disc">{line}</li>
            ))}
          </ul>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-600">{text("승인 내용 요약", "Approval summary")}</p>
            <ul className="rounded bg-gray-100 px-4 py-3 text-xs leading-5 text-gray-700">
              {approvalParamSummary.map((line) => (
                <li key={line} className="list-disc">{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            aria-label={text("현재 요청에서 이 작업 범위 전체 승인", "Approve this operation scope for the current request")}
            disabled={submitted}
            onClick={() => respond("allow_run")}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {text("이 요청 전체 승인", "Approve entire request")}
          </button>
          <button
            type="button"
            aria-label={text("이 작업 범위를 이번 단계만 승인", "Approve this operation scope for this step only")}
            disabled={submitted}
            onClick={() => respond("allow_once")}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {text("이번 단계만", "This step only")}
          </button>
          <button
            type="button"
            aria-label={text("이 작업 범위 승인을 거부하고 요청 취소", "Deny this operation scope and cancel the request")}
            disabled={submitted}
            onClick={() => respond("deny")}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            {text("거부 후 취소", "Deny and cancel")}
          </button>
        </div>
      </div>
    </div>
  )
}
