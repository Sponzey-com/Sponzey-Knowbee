import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { evaluateCanonicalRecoveryStrategyAdmission } from "../packages/core/src/runs/canonical-recovery-strategy-admission.ts"

describe("Canonical recovery strategy admission", () => {
  it("admits a strategy that has not been attempted in the request", () => {
    expect(
      evaluateCanonicalRecoveryStrategyAdmission({
        attemptedStrategyFingerprints: new Set(),
        nextStrategyFingerprint: "sha256:strategy-a",
      }),
    ).toEqual({ ok: true })
  })

  it("rejects the same strategy with the same failure fingerprint", () => {
    expect(
      evaluateCanonicalRecoveryStrategyAdmission({
        attemptedStrategyFingerprints: new Set(["sha256:strategy-a"]),
        nextStrategyFingerprint: "sha256:strategy-a",
      }),
    ).toEqual({ ok: false, reasonCode: "recovery_strategy_unchanged" })
  })

  it("admits a materially changed recovery fingerprint", () => {
    expect(
      evaluateCanonicalRecoveryStrategyAdmission({
        attemptedStrategyFingerprints: new Set(["sha256:strategy-a"]),
        nextStrategyFingerprint: "sha256:strategy-b",
      }),
    ).toEqual({ ok: true })
  })

  it("admits a new strategy after multiple prior recovery strategies", () => {
    expect(
      evaluateCanonicalRecoveryStrategyAdmission({
        attemptedStrategyFingerprints: new Set([
          "sha256:strategy-a",
          "sha256:strategy-b",
        ]),
        nextStrategyFingerprint: "sha256:strategy-c",
      }),
    ).toEqual({ ok: true })
  })

  it("rejects returning to any earlier strategy even when failure evidence changed", () => {
    expect(
      evaluateCanonicalRecoveryStrategyAdmission({
        attemptedStrategyFingerprints: new Set([
          "sha256:strategy-a",
          "sha256:strategy-b",
        ]),
        nextStrategyFingerprint: "sha256:strategy-a",
      }),
    ).toEqual({ ok: false, reasonCode: "recovery_strategy_unchanged" })
  })

  it("uses the pure admission policy in runtime composition", () => {
    const source = readFileSync(
      new URL("../packages/core/src/runs/start-driver-dependencies.ts", import.meta.url),
      "utf8",
    )
    expect(source).toContain("attemptedStrategyFingerprints:")
    expect(source).not.toContain(
      "previousRecovery && previousRecovery !== built.descriptor.recoveryFingerprint",
    )
  })
})
