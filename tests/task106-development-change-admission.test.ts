import { describe, expect, it } from "vitest"
import { admitDevelopmentChange } from "../packages/core/src/contracts/development-change-admission.ts"

describe("Task 106 development change admission", () => {
  it("admits behavior work with prior Red evidence and executable completion assertions", () => {
    expect(
      admitDevelopmentChange({
        changeId: "change:106:behavior",
        structuralChanges: [],
        behavioralChanges: ["Add per-agent MCP session isolation."],
        redEvidenceRefs: ["test:cross-agent-session-leak:failed"],
        completionAssertionRefs: ["test:cross-agent-session-leak:passed"],
        separationMode: "behavior_only",
        independentValidationRefs: ["test:architecture:static", "test:integration:mcp-isolation"],
      }),
    ).toEqual({ status: "admitted", changeId: "change:106:behavior" })
  })

  it("rejects behavior work without Red or completion-condition evidence", () => {
    expect(
      admitDevelopmentChange({
        changeId: "change:106:no-red",
        structuralChanges: [],
        behavioralChanges: ["Change isolation behavior."],
        redEvidenceRefs: [],
        completionAssertionRefs: [],
        separationMode: "behavior_only",
        independentValidationRefs: ["typecheck"],
      }),
    ).toEqual({
      status: "rejected",
      reasonCodes: ["red_evidence_missing", "completion_assertion_missing"],
    })
  })

  it("admits structural-only preparation independently from behavior", () => {
    expect(
      admitDevelopmentChange({
        changeId: "change:106:tidy",
        structuralChanges: ["Extract the binding snapshot helper without changing output."],
        behavioralChanges: [],
        redEvidenceRefs: [],
        completionAssertionRefs: ["test:characterization:binding-snapshot"],
        separationMode: "structural_only",
        independentValidationRefs: ["test:architecture:static"],
      }),
    ).toEqual({ status: "admitted", changeId: "change:106:tidy" })
  })

  it("rejects unjustified mixed structural and behavioral work", () => {
    expect(
      admitDevelopmentChange({
        changeId: "change:106:mixed",
        structuralChanges: ["Move runtime binding ownership."],
        behavioralChanges: ["Change credential selection."],
        redEvidenceRefs: ["test:credential-leak:failed"],
        completionAssertionRefs: ["test:credential-leak:passed"],
        separationMode: "mixed_justified",
        mixedChangeReason: "",
        independentValidationRefs: [],
      }),
    ).toEqual({
      status: "rejected",
      reasonCodes: ["mixed_change_reason_missing", "independent_validation_missing"],
    })
  })
})
