import React, { type RefObject } from "react"
import type { SkillDetailResponse } from "../../contracts/skills"
import { initialSkillBindingFlow, type SkillBindingFlow, type SkillDetailDraft, type SkillDetailFlow } from "../../lib/skill-detail-flow"
import { skillAddReasonText } from "../../lib/skill-add-flow"
import { useUiI18n } from "../../lib/ui-i18n"
import { Button } from "../ui/Button"
import { Drawer } from "../ui/Drawer"
import { InlineNotice } from "../ui/InlineNotice"
import { StatusLabel } from "../ui/StatusLabel"

export interface SkillDetailDrawerProps {
  item: SkillDetailResponse | null
  flow: SkillDetailFlow
  bindingFlow?: SkillBindingFlow
  deleteFlow?: { state: "idle" | "confirming" | "deleting" | "failed"; reasonCode: string | null; agentNames: string[] }
  returnFocusRef: RefObject<HTMLElement | null>
  onEdit: () => void
  onDraftChange: (patch: Partial<SkillDetailDraft>) => void
  onSave: () => void
  onCancelEdit: () => void
  onToggleStatus: () => void
  onEditBindings: () => void
  onToggleBinding: (agentRef: string) => void
  onSaveBindings: () => void
  onCancelBindings: () => void
  onStartDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onClose: () => void
}

const FIELD_CLASS = "min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"

export function SkillDetailDrawer(props: SkillDetailDrawerProps) {
  const { language, text } = useUiI18n()
  const item = props.item
  const definitionMutable = item?.sourceKind === "local"
  const bindingFlow = props.bindingFlow ?? initialSkillBindingFlow(item?.bindings?.boundAgents.map((agent) => agent.agentRef) ?? [])
  const deleteFlow = props.deleteFlow ?? { state: "idle" as const, reasonCode: null, agentNames: [] }
  const editing = props.flow.state === "editing"
  const saving = props.flow.state === "saving"
  const bindingEditing = bindingFlow.state === "editing" || bindingFlow.state === "failed"
  const bindingSaving = bindingFlow.state === "saving"
  const allAgents = [...(item?.bindings?.boundAgents ?? []), ...(item?.bindings?.availableAgents ?? [])].sort((left, right) => left.name.localeCompare(right.name))
  const pending = saving || bindingSaving || deleteFlow.state === "deleting"
  return (
    <Drawer open={item !== null} title={item?.displayName ?? text("Skill 상세", "Skill details")} onClose={props.onClose} returnFocusRef={props.returnFocusRef} closeOnEscape={!pending}>
      {item ? (
        <div className="grid gap-5">
          {editing && definitionMutable ? (
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm font-medium text-stone-800"><span>{text("이름", "Name")}</span><input value={props.flow.draft.displayName} onChange={(event) => props.onDraftChange({ displayName: event.target.value })} className={FIELD_CLASS} disabled={saving} /></label>
              <label className="grid gap-1 text-sm font-medium text-stone-800"><span>{text("설명", "Description")}</span><textarea value={props.flow.draft.description} onChange={(event) => props.onDraftChange({ description: event.target.value })} className={`${FIELD_CLASS} min-h-24 py-3`} disabled={saving} /></label>
            </div>
          ) : (
            <dl className="divide-y divide-stone-200 text-sm">
              <div className="pb-4"><dt className="font-medium text-stone-500">{text("설명", "Description")}</dt><dd className="mt-1 leading-6 text-stone-900">{item.description || text("설명이 없습니다.", "No description.")}</dd></div>
              <div className="grid grid-cols-2 gap-4 py-4"><div><dt className="font-medium text-stone-500">{text("출처", "Source")}</dt><dd className="mt-1 text-stone-900">{item.sourceKind === "builtin" ? text("기본 제공", "Built in") : text("로컬", "Local")}</dd></div><div><dt className="font-medium text-stone-500">{text("정의 변경", "Definition changes")}</dt><dd className="mt-1 text-stone-900">{definitionMutable ? text("변경 가능", "Editable") : text("읽기 전용", "Read only")}</dd></div></div>
              <div className="grid grid-cols-2 gap-4 py-4"><div><dt className="font-medium text-stone-500">{text("실행 상태", "Runtime")}</dt><dd className="mt-1"><StatusLabel tone={item.runtimeStatus === "active" ? "success" : "neutral"}>{item.runtimeStatus}</StatusLabel></dd></div><div><dt className="font-medium text-stone-500">{text("연결된 에이전트", "Bound agents")}</dt><dd className="mt-1 text-stone-900">{item.bindingCount}</dd></div></div>
              <div className="py-4"><dt className="font-medium text-stone-500">{text("변경 버전", "Revision")}</dt><dd className="mt-1 text-stone-900">{item.revision}</dd></div>
            </dl>
          )}
          {props.flow.reasonCode ? <InlineNotice tone="danger" title={text("변경을 완료하지 못했습니다", "Could not complete the change")}>{skillAddReasonText(props.flow.reasonCode, language)}</InlineNotice> : null}
          <section className="border-t border-stone-200 pt-4" aria-labelledby="skill-agent-bindings-title">
            <div className="flex items-center justify-between gap-3"><h3 id="skill-agent-bindings-title" className="text-sm font-semibold text-stone-900">{text("연결된 에이전트", "Bound agents")}</h3>{!bindingEditing ? <Button onClick={props.onEditBindings} disabled={pending}>{text("연결 관리", "Manage")}</Button> : null}</div>
            {bindingEditing ? <div className="mt-3 grid gap-2">{allAgents.length > 0 ? allAgents.map((agent) => <label key={agent.agentRef} className="flex min-h-11 items-center gap-3 border-b border-stone-100 py-2 text-sm"><input type="checkbox" checked={bindingFlow.draftBoundAgentRefs.includes(agent.agentRef)} onChange={() => props.onToggleBinding(agent.agentRef)} disabled={bindingSaving} className="h-5 w-5 accent-stone-900" /><span>{agent.name}</span></label>) : <p className="text-sm text-stone-500">{text("연결할 수 있는 에이전트가 없습니다.", "No agents are available.")}</p>}<div className="mt-2 flex justify-end gap-2"><Button onClick={props.onCancelBindings} disabled={bindingSaving}>{text("취소", "Cancel")}</Button><Button variant="primary" onClick={props.onSaveBindings} pending={bindingSaving}>{text("연결 저장", "Save bindings")}</Button></div></div> : <p className="mt-2 text-sm leading-6 text-stone-600">{(item.bindings?.boundAgents ?? []).length > 0 ? item.bindings.boundAgents.map((agent) => agent.name).join(", ") : text("연결된 에이전트가 없습니다.", "No agents are bound.")}</p>}
            {bindingFlow.reasonCode ? <div className="mt-3"><InlineNotice tone="danger" title={text("연결을 저장하지 못했습니다", "Could not save bindings")}>{skillAddReasonText(bindingFlow.reasonCode, language)}</InlineNotice></div> : null}
          </section>
          {definitionMutable && (deleteFlow.state === "confirming" || deleteFlow.state === "failed") ? <section className="border-t border-stone-200 pt-4"><InlineNotice tone={deleteFlow.agentNames.length > 0 ? "warning" : "danger"} title={deleteFlow.agentNames.length > 0 ? text("먼저 연결을 해제해 주세요", "Remove bindings first") : text("Skill을 삭제할까요?", "Delete this Skill?")}>{deleteFlow.agentNames.length > 0 ? text(`연결된 에이전트: ${deleteFlow.agentNames.join(", ")}`, `Bound agents: ${deleteFlow.agentNames.join(", ")}`) : deleteFlow.reasonCode ? skillAddReasonText(deleteFlow.reasonCode, language) : text("목록에서 제거되며 다시 등록해야 사용할 수 있습니다.", "It will be removed from the catalog and must be registered again.")}</InlineNotice><div className="mt-3 flex justify-end gap-2"><Button onClick={props.onCancelDelete}>{text("취소", "Cancel")}</Button>{deleteFlow.agentNames.length === 0 ? <Button variant="danger" onClick={props.onConfirmDelete}>{text("삭제 확인", "Confirm delete")}</Button> : null}</div></section> : null}
          {definitionMutable ? <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
            {editing ? <><Button onClick={props.onCancelEdit} disabled={pending}>{text("취소", "Cancel")}</Button><Button variant="primary" onClick={props.onSave} pending={saving}>{text("저장", "Save")}</Button></> : <><Button variant="danger" onClick={props.onStartDelete} disabled={pending}>{text("삭제", "Delete")}</Button><Button onClick={props.onEdit} disabled={pending}>{text("편집", "Edit")}</Button><Button onClick={props.onToggleStatus} pending={saving} disabled={bindingSaving}>{item.runtimeStatus === "active" ? text("비활성화", "Disable") : text("활성화", "Enable")}</Button></>}
          </div> : null}
        </div>
      ) : null}
    </Drawer>
  )
}
