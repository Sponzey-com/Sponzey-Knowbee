import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const auditSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "AuditPage.tsx"),
  "utf-8",
)

describe("task0442 audit detail redaction", () => {
  it("does not stringify selected audit params, detail, or output into the UI", () => {
    expect(auditSource).not.toContain("function stringifyMeta")
    expect(auditSource).not.toContain("JSON.stringify(value, null, 2)")
    expect(auditSource).not.toContain("params: selected.params")
    expect(auditSource).not.toContain("detail: selected.detail")
    expect(auditSource).not.toContain("output: selected.output")
    expect(auditSource).not.toContain("{selectedMeta ||")
    expect(auditSource).toContain("buildAuditDetailSummary(selected, text)")
    expect(auditSource).toContain('text("세부 요약", "Detail summary")')
  })

  it("maps selected event internals to user-readable labels", () => {
    expect(auditSource).not.toContain("{selected.status}</dd>")
    expect(auditSource).not.toContain("{selected.kind}</dd>")
    expect(auditSource).not.toContain("{selected.timelineKind}</dd>")
    expect(auditSource).not.toContain("{selected.toolName ??")
    expect(auditSource).not.toContain("selected.approvedBy ??")
    expect(auditSource).not.toContain("selected.stopReason ?? selected.errorCode")

    expect(auditSource).toContain("auditStatusLabel(selected.status, text)")
    expect(auditSource).toContain("auditKindLabel(selected.kind, text)")
    expect(auditSource).toContain("auditTimelineKindLabel(selected.timelineKind, text)")
    expect(auditSource).toContain("describeApprovalToolName(selected.toolName, text)")
    expect(auditSource).toContain("auditReasonLabel(selected, text)")
  })
})
