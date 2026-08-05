import React from "react"
import type { McpAgentProjection } from "../../contracts/mcp"
import type { McpBindingFlow } from "../../lib/mcp-binding-flow"
import { useUiI18n } from "../../lib/ui-i18n"
import { Button } from "../ui/Button"
import { InlineNotice } from "../ui/InlineNotice"

export interface McpBindingEditorProps {
  boundAgents: readonly McpAgentProjection[]
  availableAgents: readonly McpAgentProjection[]
  flow: McpBindingFlow
  onEdit(): void
  onToggle(agentRef: string): void
  onSave(): void
  onCancel(): void
}

export function McpBindingEditor(props: McpBindingEditorProps) {
  const { text } = useUiI18n()
  const editing = ["editing", "saving", "verifying", "failed"].includes(props.flow.state)
  const pending = props.flow.state === "saving" || props.flow.state === "verifying"
  const agents = [...props.boundAgents, ...props.availableAgents].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.agentRef.localeCompare(right.agentRef),
  )
  return (
    <section className="border-t border-stone-200 pt-4" aria-labelledby="mcp-binding-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="mcp-binding-title" className="text-sm font-semibold">
            {text("연결된 에이전트", "Bound agents")}
          </h3>
          <p className="mt-1 text-sm text-stone-500">
            {text(
              `${props.flow.persistedRefs.length}개 연결`,
              `${props.flow.persistedRefs.length} bound`,
            )}
          </p>
        </div>
        {!editing ? (
          <Button onClick={props.onEdit}>{text("연결 편집", "Edit bindings")}</Button>
        ) : null}
      </div>
      {!editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {props.boundAgents.length ? (
            props.boundAgents.map((agent) => (
              <span
                key={agent.agentRef}
                className="rounded-[var(--ui-surface-radius)] bg-stone-100 px-3 py-2 text-sm font-medium"
              >
                {agent.name}
              </span>
            ))
          ) : (
            <p className="text-sm text-stone-500">
              {text("연결된 에이전트가 없습니다.", "No agents are bound.")}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {agents.length ? (
            agents.map((agent) => (
              <label
                key={agent.agentRef}
                className="flex min-h-11 items-center gap-3 rounded-[var(--ui-surface-radius)] border border-stone-200 px-3 text-sm font-medium"
              >
                <input
                  type="checkbox"
                  checked={props.flow.draftRefs.includes(agent.agentRef)}
                  onChange={() => props.onToggle(agent.agentRef)}
                  disabled={pending}
                  className="h-5 w-5 accent-stone-950"
                />
                <span>{agent.name}</span>
              </label>
            ))
          ) : (
            <p className="text-sm text-stone-500">
              {text("사용 가능한 에이전트가 없습니다.", "No agents are available.")}
            </p>
          )}
          {props.flow.reasonCode ? (
            <InlineNotice
              tone="danger"
              title={text("연결을 저장하지 못했습니다", "Could not save bindings")}
            >
              {text(
                "최신 상태를 반영했습니다. 선택을 확인하고 다시 저장해 주세요.",
                "The latest state is shown. Review the selection and save again.",
              )}
            </InlineNotice>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={props.onCancel} disabled={pending}>
              {text("취소", "Cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={props.onSave}
              pending={pending}
              disabled={pending || agents.length === 0}
            >
              {text("연결 저장", "Save bindings")}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
