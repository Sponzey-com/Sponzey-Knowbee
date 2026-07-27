import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const auditSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "AuditPage.tsx"), "utf-8")

describe("task0406 audit user-facing wording", () => {
  it("uses user-facing labels for filters and audit descriptions", () => {
    expect(auditSource).not.toContain("Inspect tool calls, approvals")
    expect(auditSource).not.toContain('placeholder={text("도구명", "Tool name")}')
    expect(auditSource).not.toContain('<option value="tool_call">tool_call</option>')
    expect(auditSource).not.toContain('<option value="run_event">run_event</option>')
    expect(auditSource).not.toContain('<option value="decision_trace">decision_trace</option>')
    expect(auditSource).not.toContain('<option value="ingress">ingress</option>')
    expect(auditSource).not.toContain('<option value="tool">tool</option>')

    expect(auditSource).toContain("Inspect external tool activity, approvals")
    expect(auditSource).toContain('placeholder={text("외부 도구 이름", "External tool name")}')
    expect(auditSource).toContain('value="tool_call">{text("외부 도구 활동", "External tool activity")}</option>')
    expect(auditSource).toContain('value="decision_trace">{text("결정 흐름", "Decision flow")}</option>')
    expect(auditSource).toContain('value="tool">{text("외부 도구", "External tools")}</option>')
  })

  it("uses user-facing labels for flow summary and selected event details", () => {
    expect(auditSource).not.toContain(">tool duplicates<")
    expect(auditSource).not.toContain(">answer duplicates<")
    expect(auditSource).not.toContain(">delivery retries<")
    expect(auditSource).not.toContain(">recovery reentries<")
    expect(auditSource).not.toContain("<span>tool={event.toolName}</span>")
    expect(auditSource).not.toContain('<dt className="text-stone-500">Tool</dt>')
    expect(auditSource).not.toContain('<dt className="text-stone-500">Duration</dt>')

    expect(auditSource).toContain('text("중복 외부 도구", "Duplicate external tools")')
    expect(auditSource).toContain('text("중복 답변", "Duplicate answers")')
    expect(auditSource).toContain('text("전달 재시도", "Delivery retries")')
    expect(auditSource).toContain('text("복구 재진입", "Recovery reentries")')
    expect(auditSource).toContain('{text("외부 도구", "External tool")}: {describeApprovalToolName(event.toolName, text)}')
    expect(auditSource).toContain('text("걸린 시간", "Duration")')
  })
})
