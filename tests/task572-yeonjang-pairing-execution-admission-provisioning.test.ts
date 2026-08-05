import { describe, expect, it, vi } from "vitest"

import {
  approveYeonjangPairingWithExecutionAdmissionKey,
} from "../packages/core/src/yeonjang/pairing-execution-admission-provisioning.ts"

function ports(overrides: {
  verify?: () => { ok: boolean; binding?: { extensionId: string }; reasonCode?: string }
  provision?: () => { ok: boolean; reasonCode?: string }
  approve?: () => { ok: boolean; reasonCode?: string }
  remove?: () => { ok: boolean }
} = {}, trace: string[] = []) {
  return {
    verify: vi.fn(() => {
      trace.push("verify")
      return (overrides.verify ?? (() => ({ ok: true as const, binding: { extensionId: "studio-mac" } })))()
    }),
    provision: vi.fn(() => {
      trace.push("provision")
      return (overrides.provision ?? (() => ({ ok: true as const })))()
    }),
    approve: vi.fn(() => {
      trace.push("approve")
      return (overrides.approve ?? (() => ({ ok: true as const })))()
    }),
    remove: vi.fn(() => {
      trace.push("remove")
      return (overrides.remove ?? (() => ({ ok: true as const })))()
    }),
  }
}

describe("task572 pairing execution admission provisioning", () => {
  it("verifies before provisioning and commits trust only after the key is ready", () => {
    const trace: string[] = []
    const p = ports({}, trace)
    const result = approveYeonjangPairingWithExecutionAdmissionKey({
      instanceId: "instance-001",
      pairingSecret: "private-pairing-secret",
      verifier: { verify: p.verify as never },
      keyProvisioner: { provision: p.provision as never, remove: p.remove as never },
      trustCommitter: { approve: p.approve as never },
    })

    expect(result).toEqual({ ok: true, executionAdmissionKeyStatus: "ready" })
    expect(trace).toEqual(["verify", "provision", "approve"])
    expect(p.provision).toHaveBeenCalledWith({ extensionId: "studio-mac" })
    expect(JSON.stringify(result)).not.toContain("private-pairing-secret")
  })

  it("fails before trust commit when verification or provisioning fails", () => {
    const verificationFailure = ports({ verify: () => ({ ok: false, reasonCode: "invalid" }) })
    expect(approveYeonjangPairingWithExecutionAdmissionKey({
      instanceId: "instance-001", pairingSecret: "secret",
      verifier: { verify: verificationFailure.verify as never },
      keyProvisioner: { provision: verificationFailure.provision as never, remove: verificationFailure.remove as never },
      trustCommitter: { approve: verificationFailure.approve as never },
    })).toEqual({ ok: false, reasonCode: "pairing_verification_failed" })
    expect(verificationFailure.provision).not.toHaveBeenCalled()
    expect(verificationFailure.approve).not.toHaveBeenCalled()

    const provisioningFailure = ports({ provision: () => ({ ok: false, reasonCode: "keychain" }) })
    expect(approveYeonjangPairingWithExecutionAdmissionKey({
      instanceId: "instance-001", pairingSecret: "secret",
      verifier: { verify: provisioningFailure.verify as never },
      keyProvisioner: { provision: provisioningFailure.provision as never, remove: provisioningFailure.remove as never },
      trustCommitter: { approve: provisioningFailure.approve as never },
    })).toEqual({ ok: false, reasonCode: "execution_admission_key_provision_failed" })
    expect(provisioningFailure.approve).not.toHaveBeenCalled()
  })

  it("compensates the key when trust persistence fails and reports failed compensation distinctly", () => {
    const compensated = ports({ approve: () => ({ ok: false, reasonCode: "db" }) })
    expect(approveYeonjangPairingWithExecutionAdmissionKey({
      instanceId: "instance-001", pairingSecret: "secret",
      verifier: { verify: compensated.verify as never },
      keyProvisioner: { provision: compensated.provision as never, remove: compensated.remove as never },
      trustCommitter: { approve: compensated.approve as never },
    })).toEqual({ ok: false, reasonCode: "pairing_trust_commit_failed" })
    expect(compensated.remove).toHaveBeenCalledWith({ extensionId: "studio-mac" })

    const compensationFailure = ports({
      approve: () => ({ ok: false, reasonCode: "db" }),
      remove: () => ({ ok: false }),
    })
    expect(approveYeonjangPairingWithExecutionAdmissionKey({
      instanceId: "instance-001", pairingSecret: "secret",
      verifier: { verify: compensationFailure.verify as never },
      keyProvisioner: { provision: compensationFailure.provision as never, remove: compensationFailure.remove as never },
      trustCommitter: { approve: compensationFailure.approve as never },
    })).toEqual({ ok: false, reasonCode: "pairing_trust_commit_compensation_failed" })
  })
})
