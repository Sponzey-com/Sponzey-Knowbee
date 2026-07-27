import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST,
} from "../packages/core/src/contracts/canonical-prompt-responsibility-manifest.ts"
import {
  GOAL_REVIEW_GATE_REQUIRED_KEYS,
  type GoalReviewGateReport,
} from "../packages/core/src/contracts/goal-review-gate.ts"
import {
  decideGoalDocumentReviewAcceptance,
} from "../packages/core/src/maintenance/goal-document-review-acceptance.ts"
import type { GoalDocumentRuleOccurrence } from "../packages/core/src/maintenance/goal-ownership.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

function item(key: string) {
  return { key, passed: true, evidenceRefs: [`evidence:${key}`] }
}

function completeReport(): GoalReviewGateReport {
  return {
    documentStructure: GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure.map(item),
    behaviorInvariants: GOAL_REVIEW_GATE_REQUIRED_KEYS.behaviorInvariants.map(item),
    promptSources: GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources.map(item),
    harness: GOAL_REVIEW_GATE_REQUIRED_KEYS.harness.map(item),
    operations: GOAL_REVIEW_GATE_REQUIRED_KEYS.operations.map(item),
  }
}

const section10References: GoalDocumentRuleOccurrence[] = [
  {
    ruleKey: "document:canonical-owner-alignment",
    chapter: "10",
    responsibilityKind: "document_ownership",
    occurrenceKind: "reference",
  },
  {
    ruleKey: "prompt:canonical-module-boundary",
    chapter: "10",
    responsibilityKind: "prompt_module_boundaries",
    occurrenceKind: "reference",
  },
  {
    ruleKey: "behavior:identity-language-memory",
    chapter: "10",
    responsibilityKind: "product_behavior",
    occurrenceKind: "reference",
  },
]

describe("task1280 GOAL document review acceptance", () => {
  it("accepts complete gate evidence, reference-only Section 10, and canonical prompt owners", () => {
    const report = completeReport()
    const occurrences = structuredClone(section10References)
    const manifest = structuredClone(CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST)

    expect(decideGoalDocumentReviewAcceptance({
      report,
      section10Occurrences: occurrences,
      promptManifest: manifest,
    })).toEqual({
      status: "eligible",
      documentGateKeys: [...GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure],
      moduleIds: CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST.map((entry) => entry.moduleId),
    })
    expect(occurrences).toEqual(section10References)
    expect(manifest).toEqual(CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST)
  })

  it("rejects a missing document gate with its original stable code", () => {
    const report = completeReport()
    report.documentStructure = report.documentStructure.filter((item) => item.key !== "canonical_module_boundary_alignment")

    expect(decideGoalDocumentReviewAcceptance({
      report,
      section10Occurrences: section10References,
      promptManifest: CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST,
    })).toEqual(expect.objectContaining({
      status: "blocked",
      issues: expect.arrayContaining([
        expect.objectContaining({ source: "review_gate", code: "review_gate_missing", subjectId: "canonical_module_boundary_alignment" }),
      ]),
    }))
  })

  it("rejects copied behavior definitions in Section 10 while allowing references", () => {
    expect(decideGoalDocumentReviewAcceptance({
      report: completeReport(),
      section10Occurrences: [
        ...section10References,
        {
          ruleKey: "behavior:retry-policy",
          chapter: "10",
          responsibilityKind: "product_behavior",
          occurrenceKind: "definition",
        },
      ],
      promptManifest: CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST,
    })).toEqual(expect.objectContaining({
      status: "blocked",
      issues: expect.arrayContaining([
        expect.objectContaining({ source: "document_ownership", code: "rule_wrong_owner_chapter", subjectId: "behavior:retry-policy" }),
      ]),
    }))
  })

  it("rejects a missing canonical prompt module owner", () => {
    const manifest = CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST.filter((entry) => entry.moduleId !== "result_review")

    expect(decideGoalDocumentReviewAcceptance({
      report: completeReport(),
      section10Occurrences: section10References,
      promptManifest: manifest,
    })).toEqual(expect.objectContaining({
      status: "blocked",
      issues: expect.arrayContaining([
        expect.objectContaining({ source: "prompt_manifest", code: "module_missing", subjectId: "result_review" }),
      ]),
    }))
  })

  it("keeps the current Section 10 gate-oriented and free of copied code blocks", () => {
    const markdown = readFileSync(new URL("../.tasks/phase001/goal.md", import.meta.url), "utf8")
    const section10 = markdown.match(/## 10\.[\s\S]*?(?=\n## 11\.)/u)?.[0] ?? ""

    expect(section10).toContain("수용 전 리뷰는 아래 게이트가 모두 통과하는지만 확인한다.")
    expect(section10).toContain("문서 구조 게이트:")
    expect(section10).toContain("canonical prompt module 경계와 실제 규칙 소유 위치가 일치한다.")
    expect(section10).not.toContain("```")
    expect(section10).not.toContain("System prompt source contract:")
  })

  it("finds every canonical manifest owner in the English runtime prompt registry", () => {
    const sourceIds = new Set(loadPromptSourceRegistry(process.cwd())
      .filter((source) => source.locale === "en" && source.usageScope === "runtime")
      .map((source) => source.sourceId))

    expect(CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST
      .map((entry) => entry.moduleId)
      .filter((moduleId) => !sourceIds.has(moduleId))).toEqual([])
  })
})
