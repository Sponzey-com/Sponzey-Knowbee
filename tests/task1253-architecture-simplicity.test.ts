import { describe, expect, it } from "vitest"

import {
  evaluateArchitectureSimplicity,
  evaluateNewModuleProposal,
} from "../packages/core/src/index.ts"

describe("task1253 existing-module-first and simplicity gates", () => {
  it("extends an existing canonical owner with the same responsibility", () => {
    expect(
      evaluateNewModuleProposal({
        responsibilityId: "responsibility:cleanup",
        searchComplete: true,
        candidateOwners: [
          {
            moduleId: "maintenance/cleanup-decision",
            responsibilityIds: ["responsibility:cleanup"],
          },
        ],
        proposedModuleId: "maintenance/new-cleanup",
        boundaryReason: null,
        evidenceRefs: ["evidence:graph"],
      }),
    ).toEqual({ status: "extend_existing", ownerModuleId: "maintenance/cleanup-decision" })
  })

  it.each([
    ["file", "maintenance/new-cleanup.ts"],
    ["module", "maintenance/new-cleanup"],
  ] as const)("rejects a new %s when an existing canonical owner can be extended", (_kind, proposedModuleId) => {
    expect(evaluateNewModuleProposal({
      responsibilityId: "responsibility:cleanup",
      searchComplete: true,
      candidateOwners: [{
        moduleId: "maintenance/cleanup-decision",
        responsibilityIds: ["responsibility:cleanup"],
      }],
      proposedModuleId,
      boundaryReason: null,
      evidenceRefs: ["evidence:reference-index"],
    })).toEqual({ status: "extend_existing", ownerModuleId: "maintenance/cleanup-decision" })
  })

  it.each(["dependency_inversion", "ownership_violation"] as const)(
    "allows a new boundary only for evidenced %s",
    (kind) => {
      expect(
        evaluateNewModuleProposal({
          responsibilityId: "responsibility:new-port",
          searchComplete: true,
          candidateOwners: [],
          proposedModuleId: "ports/new-boundary",
          boundaryReason: { kind, detail: "Existing infrastructure ownership would point inward." },
          evidenceRefs: ["evidence:dependency-graph"],
        }),
      ).toEqual({
        status: "new_boundary_eligible",
        proposedModuleId: "ports/new-boundary",
        reason: kind,
      })
    },
  )

  it("rejects incomplete owner searches, duplicate owners, and abstract justifications", () => {
    expect(() =>
      evaluateNewModuleProposal({
        responsibilityId: "r",
        searchComplete: false,
        candidateOwners: [],
        proposedModuleId: "new",
        boundaryReason: null,
        evidenceRefs: [],
      }),
    ).toThrow(/search.*complete/i)
    expect(() =>
      evaluateNewModuleProposal({
        responsibilityId: "r",
        searchComplete: true,
        candidateOwners: [
          { moduleId: "a", responsibilityIds: ["r"] },
          { moduleId: "b", responsibilityIds: ["r"] },
        ],
        proposedModuleId: "new",
        boundaryReason: null,
        evidenceRefs: ["evidence:1"],
      }),
    ).toThrow(/multiple canonical owners/i)
    expect(() =>
      evaluateNewModuleProposal({
        responsibilityId: "r",
        searchComplete: true,
        candidateOwners: [],
        proposedModuleId: "new",
        boundaryReason: null,
        evidenceRefs: ["evidence:1"],
      }),
    ).toThrow(/boundary reason/i)
  })

  it("accepts wrappers and adapters only when they own a real boundary behavior", () => {
    expect(
      evaluateArchitectureSimplicity({
        wrappers: [
          { moduleId: "validating-facade", ownedBehaviors: ["validation"] },
          { moduleId: "pass-through", ownedBehaviors: [] },
        ],
        adapters: [
          { moduleId: "db-adapter-a", externalBoundaryId: "sqlite", portId: "store" },
          { moduleId: "db-adapter-b", externalBoundaryId: "sqlite", portId: "store" },
        ],
        globals: [
          { symbolId: "startupSnapshot", mutable: false, purpose: "runtime_config" },
          { symbolId: "mutableConfig", mutable: true, purpose: "runtime_config" },
        ],
      }),
    ).toEqual({
      ok: false,
      violations: [
        { code: "pass_through_wrapper", ownerId: "pass-through" },
        { code: "duplicate_adapter", ownerId: "db-adapter-b" },
        { code: "hidden_mutable_global", ownerId: "mutableConfig" },
      ],
    })
  })

  it.each([
    ["adapter", "duplicate_adapter"],
    ["wrapper", "pass_through_wrapper"],
  ] as const)("rejects a new %s without a distinct owned boundary", (kind, code) => {
    const result = evaluateArchitectureSimplicity({
      wrappers: kind === "wrapper" ? [{ moduleId: "forward-only", ownedBehaviors: [] }] : [],
      adapters: kind === "adapter" ? [
        { moduleId: "existing", externalBoundaryId: "mqtt", portId: "transport" },
        { moduleId: "proposed", externalBoundaryId: "mqtt", portId: "transport" },
      ] : [],
      globals: [],
    })

    expect(result.ok).toBe(false)
    expect(result.violations).toContainEqual(expect.objectContaining({ code }))
  })

  it("accepts direct boundaries with owned behavior, one adapter, and immutable startup state", () => {
    expect(
      evaluateArchitectureSimplicity({
        wrappers: [
          { moduleId: "validated-release-gate", ownedBehaviors: ["validation"] },
        ],
        adapters: [
          { moduleId: "sqlite-agent-store", externalBoundaryId: "sqlite", portId: "agent-store" },
          { moduleId: "mqtt-yeonjang-transport", externalBoundaryId: "mqtt", portId: "yeonjang-transport" },
        ],
        globals: [
          { symbolId: "startupConfigSnapshot", mutable: false, purpose: "runtime_config" },
          { symbolId: "boundedCache", mutable: true, purpose: "cache" },
        ],
      }),
    ).toEqual({ ok: true, violations: [] })
  })
})
