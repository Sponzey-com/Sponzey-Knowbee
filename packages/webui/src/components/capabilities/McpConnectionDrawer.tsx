import React, { type ReactNode, type RefObject } from "react"
import type { McpConnectionFlow, McpConnectionFormDraft } from "../../lib/mcp-connection-flow"
import { mcpConnectionReasonText } from "../../lib/mcp-connection-flow"
import { useUiI18n } from "../../lib/ui-i18n"
import { Button } from "../ui/Button"
import { Drawer } from "../ui/Drawer"
import { InlineNotice } from "../ui/InlineNotice"

export interface McpConnectionDrawerProps {
  open: boolean
  flow: McpConnectionFlow
  returnFocusRef: RefObject<HTMLElement | null>
  onDraftChange(patch: Partial<McpConnectionFormDraft>): void
  onProbe(): void
  onSave(): void
  onClose(): void
}

const FIELD =
  "min-h-11 w-full rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)] disabled:bg-stone-100"

function Step({ active, done, children }: { active: boolean; done: boolean; children: ReactNode }) {
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={`min-w-0 border-b-2 px-1 pb-2 text-xs font-semibold ${active ? "border-stone-950 text-stone-950" : done ? "border-emerald-500 text-emerald-700" : "border-stone-200 text-stone-400"}`}
    >
      {children}
    </li>
  )
}

export function McpConnectionDrawer(props: McpConnectionDrawerProps) {
  const { language, text } = useUiI18n()
  const pending = ["probing", "saving", "verifying"].includes(props.flow.state)
  const connectionFields = props.flow.mode === "create" || props.flow.draft.replaceConnection
  const probeDone = ["ready", "saving", "verifying", "succeeded"].includes(props.flow.state)
  const saveStarted = ["saving", "verifying", "succeeded"].includes(props.flow.state)
  const nameError = props.flow.reasonCodes.find((code) => code === "mcp_display_name_missing")
  const commandError = props.flow.reasonCodes.find((code) => code === "mcp_command_missing")
  const urlError = props.flow.reasonCodes.find((code) => code.startsWith("mcp_url_"))
  const generalReasons = props.flow.reasonCodes.filter(
    (code) => code !== nameError && code !== commandError && code !== urlError,
  )

  return (
    <Drawer
      open={props.open}
      title={
        props.flow.mode === "create"
          ? text("MCP 연결 추가", "Add MCP connection")
          : text("MCP 연결 수정", "Edit MCP connection")
      }
      onClose={props.onClose}
      returnFocusRef={props.returnFocusRef}
      closeOnEscape={!pending}
    >
      <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <ol
          aria-label={text("연결 저장 단계", "Connection save steps")}
          className="grid grid-cols-3 gap-2"
        >
          <Step active={["editing", "failed"].includes(props.flow.state)} done={probeDone}>
            {text("1. 입력", "1. Input")}
          </Step>
          <Step
            active={props.flow.state === "probing" || props.flow.state === "ready"}
            done={probeDone}
          >
            {text("2. 연결 확인", "2. Check")}
          </Step>
          <Step active={saveStarted} done={props.flow.state === "succeeded"}>
            {text("3. 저장 확인", "3. Verify")}
          </Step>
        </ol>

        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>{text("이름", "Name")}</span>
          <input
            value={props.flow.draft.displayName}
            onChange={(event) => props.onDraftChange({ displayName: event.target.value })}
            className={FIELD}
            disabled={pending}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "mcp-name-error" : undefined}
          />
          {nameError ? (
            <span id="mcp-name-error" className="text-xs text-red-700">
              {mcpConnectionReasonText(nameError, language)}
            </span>
          ) : null}
        </label>

        {props.flow.mode === "edit" ? (
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-stone-800">
            <input
              type="checkbox"
              checked={props.flow.draft.replaceConnection}
              onChange={(event) =>
                props.onDraftChange({
                  replaceConnection: event.target.checked,
                  command: "",
                  argsText: "",
                  cwd: "",
                  url: "",
                })
              }
              disabled={pending}
              className="h-5 w-5 accent-stone-950"
            />
            <span>{text("연결 설정 교체", "Replace connection settings")}</span>
          </label>
        ) : null}

        {connectionFields ? (
          <fieldset className="grid gap-4 border-t border-stone-200 pt-4">
            <legend className="mb-3 text-sm font-semibold text-stone-900">
              {text("실행 연결", "Execution connection")}
            </legend>
            <fieldset className="grid gap-1 border-0 p-0 text-sm font-medium text-stone-800">
              <legend>{text("전송 방식", "Transport")}</legend>
              <div className="grid min-h-11 grid-cols-2 rounded-[var(--ui-surface-radius)] bg-stone-100 p-1">
                {(["stdio", "http"] as const).map((transport) => (
                  <button
                    type="button"
                    key={transport}
                    aria-pressed={props.flow.draft.transport === transport}
                    disabled={pending}
                    onClick={() =>
                      props.onDraftChange({
                        transport,
                        command: "",
                        argsText: "",
                        cwd: "",
                        url: "",
                      })
                    }
                    className={`min-h-11 rounded-[calc(var(--ui-surface-radius)-2px)] px-3 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)] ${props.flow.draft.transport === transport ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                  >
                    {transport === "stdio" ? "stdio" : "HTTP"}
                  </button>
                ))}
              </div>
            </fieldset>
            {props.flow.draft.transport === "http" ? (
              <label className="grid gap-1 text-sm font-medium text-stone-800">
                <span>HTTP endpoint</span>
                <input
                  type="url"
                  value={props.flow.draft.url}
                  onChange={(event) => props.onDraftChange({ url: event.target.value })}
                  className={FIELD}
                  disabled={pending}
                  placeholder="https://example.com/mcp"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(urlError)}
                  aria-describedby={urlError ? "mcp-url-error" : undefined}
                />
                {urlError ? (
                  <span id="mcp-url-error" className="text-xs text-red-700">
                    {mcpConnectionReasonText(urlError, language)}
                  </span>
                ) : null}
              </label>
            ) : (
              <>
                <label className="grid gap-1 text-sm font-medium text-stone-800">
                  <span>{text("실행 파일", "Executable")}</span>
                  <input
                    value={props.flow.draft.command}
                    onChange={(event) => props.onDraftChange({ command: event.target.value })}
                    className={FIELD}
                    disabled={pending}
                    placeholder="npx"
                    aria-invalid={Boolean(commandError)}
                    aria-describedby={commandError ? "mcp-command-error" : undefined}
                  />
                  {commandError ? (
                    <span id="mcp-command-error" className="text-xs text-red-700">
                      {mcpConnectionReasonText(commandError, language)}
                    </span>
                  ) : null}
                </label>
                <label className="grid gap-1 text-sm font-medium text-stone-800">
                  <span>{text("인자", "Arguments")}</span>
                  <textarea
                    value={props.flow.draft.argsText}
                    onChange={(event) => props.onDraftChange({ argsText: event.target.value })}
                    className={`${FIELD} min-h-24 py-3`}
                    disabled={pending}
                    placeholder={text("한 줄에 하나씩 입력", "One argument per line")}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-stone-800">
                  <span>{text("작업 폴더 (선택)", "Working folder (optional)")}</span>
                  <input
                    value={props.flow.draft.cwd}
                    onChange={(event) => props.onDraftChange({ cwd: event.target.value })}
                    className={FIELD}
                    disabled={pending}
                    placeholder="/workspace"
                  />
                </label>
              </>
            )}
          </fieldset>
        ) : (
          <InlineNotice tone="info" title={text("기존 연결 유지", "Existing connection retained")}>
            {text(
              "저장된 실행 정보는 표시하지 않으며 그대로 유지합니다.",
              "Saved execution details remain hidden and unchanged.",
            )}
          </InlineNotice>
        )}

        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-stone-800">
          <input
            type="checkbox"
            checked={props.flow.draft.required}
            onChange={(event) => props.onDraftChange({ required: event.target.checked })}
            disabled={pending}
            className="h-5 w-5 accent-stone-950"
          />
          <span>{text("필수 연결", "Required connection")}</span>
        </label>

        {generalReasons.length ? (
          <InlineNotice tone="danger" title={text("확인이 필요합니다", "Action required")}>
            {generalReasons.map((code) => mcpConnectionReasonText(code, language)).join(" ")}
          </InlineNotice>
        ) : null}
        {props.flow.state === "ready" ? (
          <InlineNotice tone="success" title={text("연결 확인 완료", "Connection verified")}>
            {text("현재 입력을 저장할 수 있습니다.", "The current input is ready to save.")}
          </InlineNotice>
        ) : null}
        {props.flow.state === "verifying" ? (
          <InlineNotice tone="info" title={text("저장 결과 확인 중", "Verifying saved result")}>
            {text(
              "최신 실행 상태와 도구 목록을 확인하고 있습니다.",
              "Checking the latest runtime status and tools.",
            )}
          </InlineNotice>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
          <Button onClick={props.onClose} disabled={pending}>
            {text("취소", "Cancel")}
          </Button>
          <Button
            onClick={props.onProbe}
            pending={props.flow.state === "probing"}
            disabled={props.flow.state === "saving" || props.flow.state === "verifying"}
          >
            {text("연결 확인", "Check connection")}
          </Button>
          <Button
            variant="primary"
            onClick={props.onSave}
            pending={props.flow.state === "saving" || props.flow.state === "verifying"}
            disabled={props.flow.state !== "ready"}
          >
            {text("저장", "Save")}
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
