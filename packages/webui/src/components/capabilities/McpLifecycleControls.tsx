import React from "react"
import type { McpCatalogDetail } from "../../contracts/mcp"
import type { McpLifecycleFlow } from "../../lib/mcp-lifecycle-flow"
import { useUiI18n } from "../../lib/ui-i18n"
import { Button } from "../ui/Button"
import { InlineNotice } from "../ui/InlineNotice"
import { StatusLabel } from "../ui/StatusLabel"

export interface McpLifecycleControlsProps {
  detail: McpCatalogDetail
  flow: McpLifecycleFlow
  onBegin(action: "enable" | "disable" | "delete"): void
  onConfirm(): void
  onCancel(): void
}

export function McpLifecycleControls({
  detail,
  flow,
  onBegin,
  onConfirm,
  onCancel,
}: McpLifecycleControlsProps) {
  const { text } = useUiI18n()
  const pending = flow.state === "saving" || flow.state === "verifying"
  const boundNames = detail.bindings.boundAgents.map((agent) => agent.name)
  const deletingBlocked = boundNames.length > 0
  const actionText =
    flow.action === "delete"
      ? text("삭제", "delete")
      : flow.action === "enable"
        ? text("활성화", "enable")
        : text("비활성화", "disable")
  return (
    <section className="border-t border-stone-200 pt-4" aria-labelledby="mcp-lifecycle-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="mcp-lifecycle-title" className="text-sm font-semibold">
            {text("연결 상태", "Connection status")}
          </h3>
          <div className="mt-2 flex gap-2">
            <StatusLabel>{detail.configuredStatus}</StatusLabel>
            <StatusLabel>{detail.runtimeStatus}</StatusLabel>
          </div>
        </div>
        {flow.state !== "confirming" && !pending ? (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => onBegin(detail.configuredStatus === "enabled" ? "disable" : "enable")}
            >
              {detail.configuredStatus === "enabled"
                ? text("비활성화", "Disable")
                : text("활성화", "Enable")}
            </Button>
            <Button variant="danger" disabled={deletingBlocked} onClick={() => onBegin("delete")}>
              {text("삭제", "Delete")}
            </Button>
          </div>
        ) : null}
      </div>
      {deletingBlocked ? (
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {text(
            `삭제하려면 먼저 ${boundNames.join(", ")} 연결을 해제하세요.`,
            `Unbind ${boundNames.join(", ")} before deleting.`,
          )}
        </p>
      ) : null}
      {flow.state === "confirming" ? (
        <div className="mt-3 border-l-2 border-amber-400 pl-3">
          <p className="text-sm leading-6">
            {text(
              `이 MCP 연결을 ${actionText}하시겠습니까?`,
              `Do you want to ${actionText} this MCP connection?`,
            )}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={onCancel}>{text("취소", "Cancel")}</Button>
            <Button variant={flow.action === "delete" ? "danger" : "primary"} onClick={onConfirm}>
              {text("확인", "Confirm")}
            </Button>
          </div>
        </div>
      ) : null}
      {pending ? (
        <output aria-live="polite" className="mt-3 block text-sm text-stone-600">
          {flow.state === "saving"
            ? text("변경을 적용하고 있습니다.", "Applying the change.")
            : text("최신 상태를 확인하고 있습니다.", "Verifying the latest state.")}
        </output>
      ) : null}
      {flow.state === "failed" ? (
        <InlineNotice
          tone="danger"
          title={text("상태 변경을 완료하지 못했습니다", "Could not complete the change")}
          className="mt-3"
        >
          {text(
            "최신 상태를 확인한 뒤 다시 시도해 주세요.",
            "Review the latest state and try again.",
          )}
        </InlineNotice>
      ) : null}
    </section>
  )
}
