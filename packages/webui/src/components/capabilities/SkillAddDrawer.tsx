import React, { type RefObject } from "react"
import { Button } from "../ui/Button"
import { Drawer } from "../ui/Drawer"
import { InlineNotice } from "../ui/InlineNotice"
import type { SkillAddDraft, SkillAddFlow } from "../../lib/skill-add-flow"
import { skillAddReasonText } from "../../lib/skill-add-flow"
import { useUiI18n } from "../../lib/ui-i18n"

export interface SkillAddDrawerProps {
  open: boolean
  flow: SkillAddFlow
  returnFocusRef: RefObject<HTMLElement | null>
  onDraftChange: (patch: Partial<SkillAddDraft>) => void
  onValidate: () => void
  onSave: () => void
  onClose: () => void
}

const FIELD_CLASS = "min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"

export function SkillAddDrawer(props: SkillAddDrawerProps) {
  const { language, text } = useUiI18n()
  const pendingValidation = props.flow.state === "validating"
  const pendingSave = props.flow.state === "saving"
  const pending = pendingValidation || pendingSave
  const validationReady = props.flow.state === "ready"

  return (
    <Drawer
      open={props.open}
      title={text("Skill 추가", "Add Skill")}
      onClose={props.onClose}
      returnFocusRef={props.returnFocusRef}
      closeOnEscape={!pending}
    >
      <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>{text("이름", "Name")}</span>
          <input
            autoFocus
            value={props.flow.draft.displayName}
            onChange={(event) => props.onDraftChange({ displayName: event.target.value })}
            className={FIELD_CLASS}
            disabled={pending}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>{text("설명", "Description")}</span>
          <textarea
            value={props.flow.draft.description}
            onChange={(event) => props.onDraftChange({ description: event.target.value })}
            className={`${FIELD_CLASS} min-h-24 py-3`}
            disabled={pending}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>{text("출처", "Source")}</span>
          <select
            value={props.flow.draft.sourceKind}
            onChange={() => props.onDraftChange({ sourceKind: "local" })}
            className={FIELD_CLASS}
            disabled={pending}
          >
            <option value="local">{text("로컬 폴더", "Local folder")}</option>
          </select>
        </label>
        {props.flow.draft.sourceKind === "local" ? (
          <label className="grid gap-1 text-sm font-medium text-stone-800">
            <span>{text("Skill 폴더", "Skill folder")}</span>
            <input
              value={props.flow.draft.requestedPath ?? ""}
              onChange={(event) => props.onDraftChange({ requestedPath: event.target.value })}
              className={FIELD_CLASS}
              placeholder="/workspace/skills/example"
              disabled={pending}
            />
          </label>
        ) : null}

        {props.flow.reasonCodes.length > 0 ? (
          <InlineNotice tone="danger" title={text("확인이 필요합니다", "Action required")}>
            {props.flow.reasonCodes.map((reasonCode) => skillAddReasonText(reasonCode, language)).join(" ")}
          </InlineNotice>
        ) : null}
        {validationReady ? (
          <InlineNotice tone="success" title={text("검사 완료", "Validation complete")}>
            {text("이 Skill을 저장할 수 있습니다.", "This Skill is ready to save.")}
          </InlineNotice>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
          <Button onClick={props.onClose} disabled={pending}>{text("취소", "Cancel")}</Button>
          <Button onClick={props.onValidate} pending={pendingValidation} disabled={pendingSave}>
            {text("검사", "Validate")}
          </Button>
          <Button variant="primary" onClick={props.onSave} pending={pendingSave} disabled={!validationReady}>
            {text("저장", "Save")}
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
