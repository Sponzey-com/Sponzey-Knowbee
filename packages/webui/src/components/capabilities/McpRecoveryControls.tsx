import React from "react"
import type { McpCatalogProjection } from "../../contracts/mcp"
import type { McpRecoveryFlow } from "../../lib/mcp-recovery-flow"
import { useUiI18n } from "../../lib/ui-i18n"
import { Button } from "../ui/Button"
import { InlineNotice } from "../ui/InlineNotice"

const reasonText = (reasonCode: string | null, language: "ko" | "en") => {
  const known: Record<string, readonly [string, string]> = {
    mcp_connection_probe_failed: [
      "저장된 연결 정보로 응답하지 않습니다.",
      "The saved connection did not respond.",
    ],
    mcp_recovery_not_ready: [
      "재적용 후 연결이 준비되지 않았습니다.",
      "The connection was not ready after reapplying it.",
    ],
    mcp_recovery_projection_not_verified: [
      "최신 실행 상태를 확인하지 못했습니다.",
      "The latest runtime state could not be verified.",
    ],
    mutation_revision_conflict: [
      "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도하세요.",
      "Another change was saved first. Refresh and try again.",
    ],
  }
  return (
    (reasonCode ? known[reasonCode] : undefined)?.[language === "ko" ? 0 : 1] ??
    (language === "ko"
      ? "연결을 복구하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도하세요."
      : "The connection could not be recovered. Review the latest state and try again.")
  )
}

export function McpRecoveryControls(props: {
  issueCode: McpCatalogProjection["issueCode"]
  issueText: string
  flow: McpRecoveryFlow
  onRecover(): void
  onCancel(): void
}) {
  const { language, text } = useUiI18n()
  const pending = ["inspecting", "applying", "verifying"].includes(props.flow.state)
  if (!props.issueCode && props.flow.state === "idle") return null
  if (!props.issueCode && props.flow.state === "succeeded")
    return (
      <InlineNotice tone="success" title={text("연결 복구 완료", "Connection recovered")}>
        {text("최신 도구 상태를 확인했습니다.", "The latest tool state was verified.")}
      </InlineNotice>
    )
  const failed = props.flow.state === "failed"
  return (
    <section
      role={failed ? "alert" : "status"}
      data-tone={failed ? "danger" : "warning"}
      className={`rounded-[var(--ui-surface-radius)] border px-4 py-3 ${failed ? "border-red-200 bg-red-50 text-red-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}
    >
      <h3 className="text-sm font-semibold">
        {failed
          ? text("연결 복구 실패", "Recovery failed")
          : text("확인이 필요합니다", "Needs attention")}
      </h3>
      <p className="mt-1 text-sm leading-6">
        {failed ? reasonText(props.flow.reasonCode, language) : props.issueText}
      </p>
      {pending ? (
        <output aria-live="polite" className="mt-3 block text-sm">
          {props.flow.state === "inspecting"
            ? text("저장된 연결을 검사하고 있습니다.", "Inspecting the saved connection.")
            : props.flow.state === "applying"
              ? text("이 연결만 다시 적용하고 있습니다.", "Reapplying only this connection.")
              : text("최신 도구 상태를 확인하고 있습니다.", "Verifying the latest tool state.")}
        </output>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {pending ? <Button onClick={props.onCancel}>{text("취소", "Cancel")}</Button> : null}
        <Button variant="primary" disabled={pending} onClick={props.onRecover}>
          {text("다시 검사", "Check again")}
        </Button>
      </div>
    </section>
  )
}
