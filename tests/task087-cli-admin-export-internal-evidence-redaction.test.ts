import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { redactLiveAcceptanceCommandOutput } from "../packages/cli/src/commands/live-acceptance.ts"
import { redactChannelSmokeCommandOutput } from "../packages/cli/src/commands/smoke.ts"

const INTERNAL_EVIDENCE_TEXT =
  "yeonjang-goal-validation:camera_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-087 receipt payload raw observed state structured diagnosis payload DB row"

function expectNoInternalEvidence(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized).toContain("[internal-evidence-redacted]")
  expect(serialized).not.toContain("yeonjang-goal-validation")
  expect(serialized).not.toContain("operationId")
  expect(serialized).not.toContain("operation:run-087")
  expect(serialized).not.toContain("receipt payload")
  expect(serialized).not.toContain("raw observed state")
  expect(serialized).not.toContain("structured diagnosis payload")
  expect(serialized).not.toContain("DB row")
}

describe("task087 CLI/admin export internal evidence redaction", () => {
  it("redacts live acceptance command output before JSON/text printing", () => {
    const output = redactLiveAcceptanceCommandOutput({
      status: "collected",
      reasonCode: INTERNAL_EVIDENCE_TEXT,
      evidenceCount: 7,
      events: [
        {
          state: "payload_written",
          operationId: "operation:run-087",
          detail: INTERNAL_EVIDENCE_TEXT,
        },
      ],
    })

    expectNoInternalEvidence(output)
  })

  it("redacts channel smoke command output before JSON/text printing", () => {
    const output = redactChannelSmokeCommandOutput({
      ok: true,
      mode: "live-run",
      runId: "smoke-run:087",
      status: "failed",
      summary: INTERNAL_EVIDENCE_TEXT,
      counts: { total: 1, passed: 0, failed: 1, skipped: 0 },
      results: [
        {
          scenarioId: "telegram.failure_tool",
          status: "failed",
          failureCount: 1,
          operationId: "operation:run-087",
          failures: [INTERNAL_EVIDENCE_TEXT],
        },
      ],
    })

    expectNoInternalEvidence(output)
  })

  it("keeps admin route sanitizer wired through the shared UI redaction boundary", () => {
    const source = readFileSync("packages/core/src/api/routes/admin.ts", "utf8")

    expect(source).toContain('import { redactUiValue } from "../../ui/redaction.js"')
    expect(source).toContain("function sanitizeAdminGeneralValue(value: unknown): unknown")
    expect(source).toContain('redactUiValue(sanitizeAdminAuditValue(value), { audience: "admin" })')
    expect(source).toContain("return JSON.stringify(sanitizeAdminGeneralValue(value))")
    expect(source).toContain("detail: sanitizeAdminGeneralValue(event.detail)")
    expect(source).not.toContain("return JSON.stringify(sanitizeAdminAuditValue(value))")
  })
})
