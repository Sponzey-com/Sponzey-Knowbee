import { describe, expect, it } from "vitest"
import {
  compareLegacyRollbackBundle,
  createLegacyRollbackBundle,
  deriveLegacyRollbackCoverage,
  legacyRemovalProofSourceDigest,
  sha256,
  validateLegacyRollbackBundle,
} from "../scripts/lib/legacy-rollback-bundle.mjs"

const input = {
  sourceProofDigest: sha256("proof"),
  units: [
    { unitId: "component:a", paths: ["src/a.ts", "tests/a.test.ts"] },
    { unitId: "api:b", paths: ["src/api.ts"] },
  ],
  files: [
    { path: "tests/a.test.ts", content: "test" },
    { path: "src/api.ts", content: "api" },
    { path: "src/a.ts", content: "a" },
  ],
}
const expected = {
  unitIds: ["component:a", "api:b"],
  evidencePaths: ["src/a.ts", "tests/a.test.ts", "src/api.ts"],
}

describe("Task063 legacy rollback bundle", () => {
  it("creates a deterministic sorted bundle and validates complete coverage", () => {
    const first = createLegacyRollbackBundle(input)
    const second = createLegacyRollbackBundle({ ...input, files: [...input.files].reverse() })
    expect(first).toEqual(second)
    expect(first.files.map((file) => file.path)).toEqual(["src/a.ts", "src/api.ts", "tests/a.test.ts"])
    expect(validateLegacyRollbackBundle(first, expected)).toMatchObject({ valid: true, unitCount: 2, fileCount: 3 })
  })

  it("derives unit source and evidence coverage from the two prior reports", () => {
    expect(deriveLegacyRollbackCoverage({
      decision: { candidates: [{ candidateId: "component:a", source: "src/a.ts" }] },
    }, {
      units: [{ unitId: "component:a", candidateIds: ["component:a"], evidence: [{ path: "tests/a.test.ts" }] }],
    })).toEqual({
      units: [{ unitId: "component:a", paths: ["src/a.ts", "tests/a.test.ts"] }],
      unitIds: ["component:a"],
      evidencePaths: ["src/a.ts", "tests/a.test.ts"],
    })
  })

  it("keeps the source proof digest stable when only gate results change", () => {
    const proof = { schemaVersion: "v1", compatibilityObligations: 0, units: [{ unitId: "a" }], operations: [] }
    expect(legacyRemovalProofSourceDigest({ ...proof, phase10Ready: false, rollback: { rollbackPackage: false } }))
      .toBe(legacyRemovalProofSourceDigest({ ...proof, phase10Ready: true, rollback: { rollbackPackage: true } }))
  })

  it.each([
    ["content hash mismatch", (bundle: ReturnType<typeof createLegacyRollbackBundle>) => ({ ...bundle, files: [{ ...bundle.files[0], content: "changed" }, ...bundle.files.slice(1)] }), "content_hash_mismatch"],
    ["bundle digest mismatch", (bundle: ReturnType<typeof createLegacyRollbackBundle>) => ({ ...bundle, bundleDigest: "0".repeat(64) }), "bundle_digest_mismatch"],
    ["path traversal", (bundle: ReturnType<typeof createLegacyRollbackBundle>) => ({ ...bundle, files: [{ ...bundle.files[0], path: "../secret" }, ...bundle.files.slice(1)] }), "path_invalid"],
    ["duplicate path", (bundle: ReturnType<typeof createLegacyRollbackBundle>) => ({ ...bundle, files: [...bundle.files, bundle.files[0]] }), "path_duplicate"],
  ])("rejects %s", (_label, mutate, reason) => {
    const result = validateLegacyRollbackBundle(mutate(createLegacyRollbackBundle(input)), expected)
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes(reason))).toBe(true)
  })

  it("rejects missing units and evidence paths", () => {
    const result = validateLegacyRollbackBundle(createLegacyRollbackBundle(input), {
      unitIds: [...expected.unitIds, "component:missing"],
      evidencePaths: [...expected.evidencePaths, "src/missing.ts"],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      "expected_unit_missing:component:missing",
      "expected_evidence_path_missing:src/missing.ts",
    ]))
  })

  it("reports exact, missing and drifted files without restoring them", () => {
    const bundle = createLegacyRollbackBundle(input)
    expect(compareLegacyRollbackBundle(bundle, [
      { path: "src/a.ts", content: "a" },
      { path: "src/api.ts", content: "changed" },
    ])).toEqual({
      exact: false,
      same: ["src/a.ts"],
      missing: ["tests/a.test.ts"],
      drifted: ["src/api.ts"],
    })
  })
})
