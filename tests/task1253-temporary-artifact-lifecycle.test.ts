import { describe, expect, it, vi } from "vitest"

import {
  type TemporaryArtifactLifecycleManifest,
  applyTemporaryArtifactLifecycleDecision,
  evaluateTemporaryArtifactLifecycle,
} from "../packages/core/src/index.ts"

function manifest(
  overrides: Partial<TemporaryArtifactLifecycleManifest> = {},
): TemporaryArtifactLifecycleManifest {
  return {
    artifactId: "packages/core/src/legacy.ts",
    kind: "temporary_compatibility",
    ownerId: "owner:runtime",
    createdVersion: "v1",
    expiryCondition: {
      conditionId: "release:v2",
      satisfied: false,
      evidenceRefs: ["evidence:release"],
    },
    removalCondition: {
      conditionId: "consumer:zero",
      satisfied: false,
      evidenceRefs: ["evidence:consumer"],
    },
    activeConsumerIds: ["consumer:legacy"],
    ...overrides,
  }
}

describe("task1253 temporary artifact lifecycle", () => {
  it.each(["temporary_compatibility", "experiment", "backup"] as const)(
    "keeps active %s artifacts with complete lifecycle metadata",
    (kind) => {
      expect(evaluateTemporaryArtifactLifecycle(manifest({ kind }))).toMatchObject({
        status: "active",
        artifactId: "packages/core/src/legacy.ts",
      })
    },
  )

  it("authorizes exact removal after expiry, removal condition, and zero consumers", () => {
    expect(
      evaluateTemporaryArtifactLifecycle(
        manifest({
          expiryCondition: {
            conditionId: "release:v2",
            satisfied: true,
            evidenceRefs: ["evidence:release"],
          },
          removalCondition: {
            conditionId: "consumer:zero",
            satisfied: true,
            evidenceRefs: ["evidence:consumer"],
          },
          activeConsumerIds: [],
          expiryDisposition: { kind: "remove" },
        }),
      ),
    ).toMatchObject({ status: "removal_eligible", artifactId: "packages/core/src/legacy.ts" })
  })

  it("requires owner, conditions, and evidence for every temporary artifact", () => {
    expect(() => evaluateTemporaryArtifactLifecycle(manifest({ ownerId: "" }))).toThrow(/owner id/i)
    expect(() =>
      evaluateTemporaryArtifactLifecycle(
        manifest({ expiryCondition: { conditionId: "", satisfied: false, evidenceRefs: [] } }),
      ),
    ).toThrow(/expiry condition/i)
    expect(() =>
      evaluateTemporaryArtifactLifecycle(
        manifest({
          removalCondition: { conditionId: "remove", satisfied: false, evidenceRefs: [] },
        }),
      ),
    ).toThrow(/removal condition evidence/i)
  })

  it("rejects expiry without remove or evidenced renewal disposition", () => {
    expect(() =>
      evaluateTemporaryArtifactLifecycle(
        manifest({
          expiryCondition: {
            conditionId: "release:v2",
            satisfied: true,
            evidenceRefs: ["evidence:release"],
          },
        }),
      ),
    ).toThrow(/expiry disposition/i)
    expect(() =>
      evaluateTemporaryArtifactLifecycle(
        manifest({
          expiryCondition: {
            conditionId: "release:v2",
            satisfied: true,
            evidenceRefs: ["evidence:release"],
          },
          expiryDisposition: {
            kind: "renew",
            nextLifecycleVersion: "v2",
            approvalEvidenceRefs: [],
          },
        }),
      ),
    ).toThrow(/renewal approval/i)
  })

  it("does not remove while a consumer or removal condition remains", () => {
    expect(() =>
      evaluateTemporaryArtifactLifecycle(
        manifest({
          expiryCondition: {
            conditionId: "release:v2",
            satisfied: true,
            evidenceRefs: ["evidence:release"],
          },
          expiryDisposition: { kind: "remove" },
        }),
      ),
    ).toThrow(/removal condition|active consumer/i)
  })

  it("invokes removal only for the exact eligible artifact", async () => {
    const decision = evaluateTemporaryArtifactLifecycle(
      manifest({
        expiryCondition: {
          conditionId: "release:v2",
          satisfied: true,
          evidenceRefs: ["evidence:release"],
        },
        removalCondition: {
          conditionId: "consumer:zero",
          satisfied: true,
          evidenceRefs: ["evidence:consumer"],
        },
        activeConsumerIds: [],
        expiryDisposition: { kind: "remove" },
      }),
    )
    const remove = vi.fn(async () => undefined)
    await expect(applyTemporaryArtifactLifecycleDecision({ decision, remove })).resolves.toEqual({
      status: "removed",
      artifactId: "packages/core/src/legacy.ts",
    })
    expect(remove).toHaveBeenCalledWith("packages/core/src/legacy.ts")
  })
})
