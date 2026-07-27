import { describe, expect, it, vi } from "vitest"

import {
  type ArtifactPurposeOwner,
  applyArtifactOwnerConsolidation,
  evaluateArtifactOwnerConsolidation,
} from "../packages/core/src/index.ts"

const canonical: ArtifactPurposeOwner = {
  artifactId: "packages/core/src/canonical.ts",
  canonical: true,
  activeConsumerIds: ["consumer:runtime"],
}

describe("task1252 canonical artifact owner consolidation", () => {
  it("authorizes removal and migration around exactly one canonical owner", () => {
    expect(
      evaluateArtifactOwnerConsolidation({
        purposeId: "purpose:cleanup",
        snapshotVersion: "snapshot:1",
        owners: [
          canonical,
          {
            artifactId: "packages/core/src/unused.ts",
            canonical: false,
            activeConsumerIds: [],
            disposition: { kind: "remove" },
          },
          {
            artifactId: "packages/core/src/legacy.ts",
            canonical: false,
            activeConsumerIds: ["consumer:test"],
            disposition: {
              kind: "migrate",
              targetArtifactId: canonical.artifactId,
              migrationEvidenceRefs: ["evidence:migration:1"],
            },
          },
        ],
      }),
    ).toMatchObject({
      status: "eligible",
      canonicalArtifactId: canonical.artifactId,
      removals: ["packages/core/src/unused.ts"],
      migrations: [
        { artifactId: "packages/core/src/legacy.ts", targetArtifactId: canonical.artifactId },
      ],
    })
  })

  it.each([
    [[], /exactly one canonical/i],
    [
      [canonical, { ...canonical, artifactId: "packages/core/src/second.ts" }],
      /exactly one canonical/i,
    ],
  ] as const)("rejects an invalid canonical owner count %#", (owners, error) => {
    expect(() =>
      evaluateArtifactOwnerConsolidation({
        purposeId: "purpose:x",
        snapshotVersion: "snapshot:1",
        owners: [...owners],
      }),
    ).toThrow(error)
  })

  it("rejects missing dispositions and removal with active consumers", () => {
    expect(() =>
      evaluateArtifactOwnerConsolidation({
        purposeId: "purpose:x",
        snapshotVersion: "snapshot:1",
        owners: [canonical, { artifactId: "legacy.ts", canonical: false, activeConsumerIds: [] }],
      }),
    ).toThrow(/disposition/i)
    expect(() =>
      evaluateArtifactOwnerConsolidation({
        purposeId: "purpose:x",
        snapshotVersion: "snapshot:1",
        owners: [
          canonical,
          {
            artifactId: "legacy.ts",
            canonical: false,
            activeConsumerIds: ["consumer:1"],
            disposition: { kind: "remove" },
          },
        ],
      }),
    ).toThrow(/active consumer/i)
  })

  it("requires migration evidence and an owned expiry condition", () => {
    expect(() =>
      evaluateArtifactOwnerConsolidation({
        purposeId: "purpose:x",
        snapshotVersion: "snapshot:1",
        owners: [
          canonical,
          {
            artifactId: "legacy.ts",
            canonical: false,
            activeConsumerIds: [],
            disposition: {
              kind: "migrate",
              targetArtifactId: canonical.artifactId,
              migrationEvidenceRefs: [],
            },
          },
        ],
      }),
    ).toThrow(/migration evidence/i)
    expect(() =>
      evaluateArtifactOwnerConsolidation({
        purposeId: "purpose:x",
        snapshotVersion: "snapshot:1",
        owners: [
          canonical,
          {
            artifactId: "legacy.ts",
            canonical: false,
            activeConsumerIds: [],
            disposition: {
              kind: "retain_with_expiry",
              owner: "",
              expiryCondition: "release complete",
            },
          },
        ],
      }),
    ).toThrow(/retention owner/i)
  })

  it("removes only the exact authorized artifacts after migrations complete", async () => {
    const decision = evaluateArtifactOwnerConsolidation({
      purposeId: "purpose:x",
      snapshotVersion: "snapshot:1",
      owners: [
        canonical,
        {
          artifactId: "unused.ts",
          canonical: false,
          activeConsumerIds: [],
          disposition: { kind: "remove" },
        },
        {
          artifactId: "legacy.ts",
          canonical: false,
          activeConsumerIds: ["consumer:1"],
          disposition: {
            kind: "migrate",
            targetArtifactId: canonical.artifactId,
            migrationEvidenceRefs: ["evidence:1"],
          },
        },
      ],
    })
    const calls: string[] = []
    await expect(
      applyArtifactOwnerConsolidation({
        decision,
        migrate: async (item) => {
          calls.push(`migrate:${item.artifactId}`)
        },
        remove: async (artifactId) => {
          calls.push(`remove:${artifactId}`)
        },
      }),
    ).resolves.toEqual({ status: "applied", migrated: 1, removed: 1 })
    expect(calls).toEqual(["migrate:legacy.ts", "remove:unused.ts"])
  })

  it("does not invoke removal after migration fails", async () => {
    const decision = evaluateArtifactOwnerConsolidation({
      purposeId: "purpose:x",
      snapshotVersion: "snapshot:1",
      owners: [
        canonical,
        {
          artifactId: "unused.ts",
          canonical: false,
          activeConsumerIds: [],
          disposition: { kind: "remove" },
        },
        {
          artifactId: "legacy.ts",
          canonical: false,
          activeConsumerIds: [],
          disposition: {
            kind: "migrate",
            targetArtifactId: canonical.artifactId,
            migrationEvidenceRefs: ["evidence:1"],
          },
        },
      ],
    })
    const remove = vi.fn(async () => undefined)
    await expect(
      applyArtifactOwnerConsolidation({
        decision,
        migrate: async () => {
          throw new Error("failed")
        },
        remove,
      }),
    ).rejects.toThrow("failed")
    expect(remove).not.toHaveBeenCalled()
  })
})
