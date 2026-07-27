import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "BackendHealthCard.tsx"),
  "utf-8",
)

describe("task0447 ai capability card redaction", () => {
  it("does not render internal capability profile metadata in the card header", () => {
    expect(source).not.toContain("profile {capabilityMatrix.profileId}")
    expect(source).not.toContain("{capabilityMatrix.adapterType} · {capabilityMatrix.authType}")
    expect(source).not.toContain("font-mono text-[11px]")
    expect(source).toContain('text("연결 기능 점검 결과를 요약해서 표시합니다.", "Capability check results are shown as a summary.")')
  })

  it("summarizes the last connection check instead of rendering raw status and message", () => {
    expect(source).not.toContain("capabilityMatrix.lastCheckResult.status} · {displayText(capabilityMatrix.lastCheckResult.message)}")
    expect(source).toContain("capabilityLastCheckStatusLabel(capabilityMatrix.lastCheckResult.status, text)")
    expect(source).toContain("capabilityLastCheckSummary(capabilityMatrix.lastCheckResult.status, text)")
  })

  it("uses stronger autocomplete protection for secret credential fields", () => {
    expect(source).toContain('autoComplete={field.inputType === "password" ? "new-password" : "off"}')
    expect(source).not.toContain('autoComplete="off"')
  })
})
