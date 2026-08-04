import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  analyzeUiSourcePatterns,
  evaluateUiFoundationEntry,
  validatePatternDebt,
} from "../scripts/self/lib/ui-pattern-inventory.mjs"

describe("task012 UI pattern inventory and entry gate", () => {
  it("finds oversized radius, unnamed icon buttons, and raw status styling", () => {
    const findings = analyzeUiSourcePatterns({ path: "components/NewPanel.tsx", source: `<div className="rounded-2xl"><button><svg aria-hidden="true" /></button><span className="bg-red-50 text-red-700">Failed</span></div>` })
    expect(new Set(findings.map((item) => item.kind))).toEqual(new Set([
      "radius_exceeds_contract", "icon_button_name_missing", "raw_status_style",
    ]))
    expect(findings.every((item) => item.line === 1)).toBe(true)
  })

  it("separates recorded legacy debt from newly introduced violations", () => {
    expect(validatePatternDebt({
      findings: [
        { path: "legacy.tsx", line: 1, kind: "radius_exceeds_contract", replacement: "surface-radius token" },
        { path: "new.tsx", line: 2, kind: "raw_status_style", replacement: "StatusLabel" },
      ],
      baselineCounts: { "legacy.tsx:radius_exceeds_contract": 1 },
    })).toEqual({ ok: false, diagnostics: [
      { path: "new.tsx", kind: "raw_status_style", reasonCode: "pattern_debt_increased", actual: 1, baseline: 0 },
    ] })
  })

  it("allows Phase 3 contracts while carrying migration debt into vertical slices", () => {
    expect(evaluateUiFoundationEntry({ tokens: "verified", primitives: "verified", focus: "verified", mobileTargets: "verified", build: "verified", migrationDebt: 120 })).toEqual({
      allowed: true,
      blockers: [],
      followUpReasonCodes: ["ui_pattern_migration_required"],
    })
    expect(evaluateUiFoundationEntry({ tokens: "missing", primitives: "verified", focus: "verified", mobileTargets: "verified", build: "verified", migrationDebt: 0 }).allowed).toBe(false)
  })

  it("keeps the analyzer deterministic and side-effect free", () => {
    const source = readFileSync("scripts/self/lib/ui-pattern-inventory.mjs", "utf8")
    expect(source).not.toMatch(/process\.env|readFile|writeFile|fetch\(|console\./)
  })
})
