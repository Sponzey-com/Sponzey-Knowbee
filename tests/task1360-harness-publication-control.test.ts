import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  CURRENT_HARNESS_CONTROL_EVIDENCE,
  HARNESS_STATE_MACHINE_COMPONENTS,
  authorizeHarnessPublication,
  publishAuthorizedHarness,
  verifyCurrentHarnessControl,
  verifyHarnessStateMachineCompleteness,
  type CurrentHarnessControlReceipt,
} from "../packages/core/src/contracts/harness-publication-control.ts"

const now = Date.UTC(2026, 6, 15, 2)
const fingerprint = "proposal:harness:1360"

function controlReceipt(): CurrentHarnessControlReceipt {
  return {
    schemaVersion: 1,
    proposalRunId: "run:proposal",
    proposalFingerprint: fingerprint,
    activeHarnessVersion: "harness:v10",
    activeHarnessChecksum: "aaaaaaaa",
    controllingHarnessChecksum: "aaaaaaaa",
    targetSourceRefs: ["packages/core/src/memory/prompt-improvement-harness.ts#state-machine"],
    evidence: CURRENT_HARNESS_CONTROL_EVIDENCE.map((kind) => ({ kind, proposalFingerprint: fingerprint, evidenceRef: `receipt:${kind}` })),
    issuedAt: now - 100,
    expiresAt: now + 100,
  }
}

function stateMachine() {
  return verifyHarnessStateMachineCompleteness({
    proposalFingerprint: fingerprint,
    components: HARNESS_STATE_MACHINE_COMPONENTS.map((component) => ({ component, proposalFingerprint: fingerprint, definitionRef: `harness:${component}:v11` })),
  })
}

function publication(overrides: Partial<Parameters<typeof authorizeHarnessPublication>[0]> = {}) {
  return authorizeHarnessPublication({
    control: verifyCurrentHarnessControl({ receipt: controlReceipt(), now }),
    recursiveGate: { status: "authorized", harnessRunId: "run:harness", proposalFingerprint: fingerprint, sourceSetFingerprint: "sources:1360" },
    stateMachine: stateMachine(),
    highRisk: { status: "authorized", changeId: fingerprint, risk: "high", checks: ["permission_gate"], rollbackSourceRef: "rollback:1360" },
    activation: { status: "active", activationRunId: "run:next", runtimeSnapshotFingerprint: "runtime:next", method: "restart" },
    currentRuntimeSnapshotFingerprint: "runtime:current",
    ...overrides,
  })
}

describe("task1360 harness publication control", () => {
  it("publishes only a fully controlled harness change in a later run and runtime snapshot", async () => {
    const publish = vi.fn(async () => "published")
    await expect(publishAuthorizedHarness({ decision: publication(), publish }))
      .resolves.toEqual({ status: "published", result: "published" })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ proposalFingerprint: fingerprint, activationRunId: "run:next" }))
  })

  it.each(CURRENT_HARNESS_CONTROL_EVIDENCE)("blocks missing current-harness evidence %s", (evidenceKind) => {
    const receipt = controlReceipt()
    receipt.evidence = receipt.evidence.filter((item) => item.kind !== evidenceKind)
    expect(verifyCurrentHarnessControl({ receipt, now }))
      .toEqual({ status: "blocked", reasonCode: "control_evidence_missing", evidenceKind })
  })

  it("blocks inactive, expired, and wrong-proposal current harness control", () => {
    expect(verifyCurrentHarnessControl({ receipt: { ...controlReceipt(), controllingHarnessChecksum: "bbbbbbbb" }, now }))
      .toEqual({ status: "blocked", reasonCode: "inactive_harness_control" })
    expect(verifyCurrentHarnessControl({ receipt: { ...controlReceipt(), expiresAt: now }, now }))
      .toEqual({ status: "blocked", reasonCode: "control_receipt_expired" })
    const receipt = controlReceipt()
    receipt.evidence[0] = { ...receipt.evidence[0], proposalFingerprint: "proposal:other" }
    expect(verifyCurrentHarnessControl({ receipt, now })).toEqual({ status: "blocked", reasonCode: "control_evidence_scope_mismatch", evidenceKind: "input" })
  })

  it.each(HARNESS_STATE_MACHINE_COMPONENTS)("blocks missing state-machine component %s", (component) => {
    expect(verifyHarnessStateMachineCompleteness({
      proposalFingerprint: fingerprint,
      components: HARNESS_STATE_MACHINE_COMPONENTS.filter((item) => item !== component)
        .map((item) => ({ component: item, proposalFingerprint: fingerprint, definitionRef: `harness:${item}` })),
    })).toEqual({ status: "blocked", reasonCode: "state_machine_component_missing", component })
  })

  it("blocks duplicate, empty, and cross-proposal state-machine definitions", () => {
    const complete = HARNESS_STATE_MACHINE_COMPONENTS.map((component) => ({ component, proposalFingerprint: fingerprint, definitionRef: `harness:${component}` }))
    expect(verifyHarnessStateMachineCompleteness({ proposalFingerprint: fingerprint, components: [...complete, complete[0]] }))
      .toEqual({ status: "blocked", reasonCode: "state_machine_component_invalid", component: "state" })
    expect(verifyHarnessStateMachineCompleteness({ proposalFingerprint: fingerprint, components: complete.map((item) => item.component === "event" ? { ...item, definitionRef: "" } : item) }))
      .toEqual({ status: "blocked", reasonCode: "state_machine_component_invalid", component: "event" })
    expect(verifyHarnessStateMachineCompleteness({ proposalFingerprint: fingerprint, components: complete.map((item) => item.component === "transition" ? { ...item, proposalFingerprint: "proposal:other" } : item) }))
      .toEqual({ status: "blocked", reasonCode: "state_machine_scope_mismatch", component: "transition" })
  })

  it.each([
    ["current_harness_control_unverified", { control: { status: "blocked", reasonCode: "control_receipt_invalid" } }],
    ["recursive_gate_unverified", { recursiveGate: { status: "blocked", reasonCode: "harness_receipt_invalid" } }],
    ["state_machine_incomplete", { stateMachine: { status: "blocked", reasonCode: "state_machine_component_missing", component: "state" } }],
    ["high_risk_verification_missing", { highRisk: { status: "blocked", reasonCode: "check_missing", check: "rollback" } }],
    ["activation_unconfirmed", { activation: { status: "pending", reasonCode: "regression_tests_missing" } }],
  ] as const)("blocks publication when %s", async (reasonCode, override) => {
    const publish = vi.fn()
    const denied = publication(override as Partial<Parameters<typeof authorizeHarnessPublication>[0]>)
    expect(denied).toEqual({ status: "blocked", reasonCode })
    await publishAuthorizedHarness({ decision: denied, publish })
    expect(publish).not.toHaveBeenCalled()
  })

  it("blocks current-run and current-snapshot self activation before publication", async () => {
    const publish = vi.fn()
    const sameRun = publication({ activation: { status: "active", activationRunId: "run:proposal", runtimeSnapshotFingerprint: "runtime:next", method: "restart" } })
    const sameSnapshot = publication({ activation: { status: "active", activationRunId: "run:next", runtimeSnapshotFingerprint: "runtime:current", method: "restart" } })
    expect(sameRun).toEqual({ status: "blocked", reasonCode: "current_run_activation_forbidden" })
    expect(sameSnapshot).toEqual({ status: "blocked", reasonCode: "current_snapshot_activation_forbidden" })
    await publishAuthorizedHarness({ decision: sameRun, publish })
    await publishAuthorizedHarness({ decision: sameSnapshot, publish })
    expect(publish).not.toHaveBeenCalled()
  })

  it("uses only injected immutable decisions and receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/harness-publication-control.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|createLogger|globalThis/u)
  })
})
