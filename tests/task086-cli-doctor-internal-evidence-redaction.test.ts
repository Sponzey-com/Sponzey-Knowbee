import { describe, expect, it } from "vitest"
import { redactDoctorCommandOutput } from "../packages/cli/src/commands/doctor.ts"
import { redactUiValue } from "../packages/core/src/ui/redaction.ts"
import type { DoctorReport } from "../packages/core/src/diagnostics/doctor.ts"

function reportWithInternalEvidence(): DoctorReport {
  return {
    kind: "knowbee.doctor.report",
    id: "doctor-task086",
    mode: "quick",
    ranAt: "2026-07-21T00:00:00.000Z",
    runtimeManifestId: "manifest-task086",
    overallStatus: "warning",
    summary: { ok: 0, warning: 1, blocked: 0, unknown: 0 },
    checks: [
      {
        name: "yeonjang.runtime",
        status: "warning",
        message:
          "yeonjang-goal-validation:camera_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-086 raw observed state",
        guide: "Review receipt payload and structured diagnosis payload",
        detail: {
          operationId: "operation:run-086",
          rawObservedState: "raw observed state",
        },
      },
    ],
  }
}

describe("task086 CLI doctor internal evidence redaction", () => {
  it("redacts internal evidence from JSON doctor output data before printing", () => {
    const output = redactDoctorCommandOutput(
      reportWithInternalEvidence(),
      "/Users/me/private/.knowbee/doctor-task086.json",
      redactUiValue,
    )

    const serialized = JSON.stringify(output)
    expect(serialized).toContain("[internal-evidence-redacted]")
    expect(serialized).not.toContain("yeonjang-goal-validation")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:run-086")
    expect(serialized).not.toContain("receipt payload")
    expect(serialized).not.toContain("raw observed state")
    expect(serialized).not.toContain("structured diagnosis payload")
  })

  it("keeps CLI doctor command wired through the redacted output helper", () => {
    const output = redactDoctorCommandOutput(reportWithInternalEvidence(), null, redactUiValue)
    const serialized = JSON.stringify(output)

    expect(serialized).toContain("[internal-evidence-redacted]")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:run-086")
  })
})
