import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  auditGoalOwnership,
  auditGoalRuleOwnership,
  type GoalDocumentRuleOccurrence,
} from "../packages/core/src/maintenance/goal-ownership.ts"
import { extractGoalNormativeClauses } from "../packages/core/src/maintenance/goal-requirement-audit.ts"

const validOccurrences: GoalDocumentRuleOccurrence[] = [
  {
    ruleKey: "identity:agent-name",
    chapter: "3",
    responsibilityKind: "product_behavior",
    occurrenceKind: "definition",
  },
  {
    ruleKey: "identity:agent-name",
    chapter: "4",
    responsibilityKind: "product_behavior",
    occurrenceKind: "reference",
  },
  {
    ruleKey: "prompt:composition-order",
    chapter: "4",
    responsibilityKind: "prompt_authoring_contract",
    occurrenceKind: "definition",
  },
  {
    ruleKey: "harness:approval",
    chapter: "9",
    responsibilityKind: "prompt_improvement_harness",
    occurrenceKind: "definition",
  },
  {
    ruleKey: "harness:approval",
    chapter: "10",
    responsibilityKind: "prompt_improvement_harness",
    occurrenceKind: "reference",
  },
]

function codes(occurrences: GoalDocumentRuleOccurrence[]): string[] {
  return auditGoalRuleOwnership({ occurrences }).diagnostics.map((item) => item.code)
}

describe("task1279 GOAL document rule ownership", () => {
  it("keeps the current GOAL in canonical owner chapters without duplicate normalized clauses", () => {
    const markdown = readFileSync(new URL("../.tasks/phase001/goal.md", import.meta.url), "utf8")
    const ownership = auditGoalOwnership({ goalMarkdown: markdown })
    const inventory = extractGoalNormativeClauses(markdown)
    const sectionsByText = new Map<string, string[]>()
    for (const clause of inventory.clauses) {
      sectionsByText.set(clause.text, [...(sectionsByText.get(clause.text) ?? []), clause.section])
    }

    expect(ownership).toEqual({ complete: true, state: "proven", diagnostics: [] })
    expect(inventory.diagnostics).toEqual([])
    expect([...sectionsByText.entries()].filter(([, sections]) => sections.length > 1)).toEqual([])
  })

  it("keeps chapter 4 limited to prompt source authoring and composition contracts", () => {
    const markdown = readFileSync(new URL("../.tasks/phase001/goal.md", import.meta.url), "utf8")
    const chapter4 = markdown.match(/## 4\.[\s\S]*?(?=\n## 5\.)/u)?.[0] ?? ""

    expect(chapter4).toContain("4장은 실제 프롬프트 파일을 만들 때 지켜야 하는 조합 계약만 정의한다.")
    expect(chapter4).toContain("프롬프트 조합 순서는 다음을 따른다.")
    expect(chapter4).not.toContain("System prompt source contract:")
    expect(chapter4).not.toContain("When a user request fails, diagnose the failure")
    expect(chapter4).not.toContain("Keep agent memory isolated")
    expect(chapter4).not.toContain("Treat harness changes as high-risk meta-improvements")
  })

  it("accepts one canonical definition and reference-only consumers", () => {
    const input = structuredClone(validOccurrences)

    expect(auditGoalRuleOwnership({ occurrences: input })).toEqual({
      complete: true,
      state: "proven",
      diagnostics: [],
    })
    expect(input).toEqual(validOccurrences)
  })

  it("rejects a definition outside the canonical owner chapter", () => {
    expect(codes([
      ...validOccurrences,
      {
        ruleKey: "memory:isolation",
        chapter: "4",
        responsibilityKind: "product_behavior",
        occurrenceKind: "definition",
      },
    ])).toContain("rule_wrong_owner_chapter")
  })

  it("rejects duplicate definitions while allowing repeated references", () => {
    const repeatedReferences: GoalDocumentRuleOccurrence[] = [
      ...validOccurrences,
      {
        ruleKey: "identity:agent-name",
        chapter: "10",
        responsibilityKind: "product_behavior",
        occurrenceKind: "reference",
      },
    ]
    expect(auditGoalRuleOwnership({ occurrences: repeatedReferences }).complete).toBe(true)

    expect(codes([
      ...validOccurrences,
      {
        ruleKey: "identity:agent-name",
        chapter: "10",
        responsibilityKind: "product_behavior",
        occurrenceKind: "definition",
      },
    ])).toEqual(expect.arrayContaining([
      "rule_definition_duplicate",
      "rule_wrong_owner_chapter",
    ]))
  })

  it.each([
    "product_behavior",
    "prompt_improvement_harness",
    "handoff_schema",
  ] as const)("rejects %s definitions leaked into chapter 4", (responsibilityKind) => {
    expect(codes([
      ...validOccurrences,
      {
        ruleKey: `leak:${responsibilityKind}`,
        chapter: "4",
        responsibilityKind,
        occurrenceKind: "definition",
      },
    ])).toContain("chapter4_responsibility_leak")
  })

  it("reports stable rule, observed chapter, and expected chapter facts", () => {
    const result = auditGoalRuleOwnership({
      occurrences: [{
        ruleKey: "delegation:direct-child-only",
        chapter: "4",
        responsibilityKind: "product_behavior",
        occurrenceKind: "definition",
      }],
    })

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      {
        code: "rule_wrong_owner_chapter",
        ruleKey: "delegation:direct-child-only",
        chapter: "4",
        expectedChapter: "3",
        responsibilityKind: "product_behavior",
      },
      {
        code: "chapter4_responsibility_leak",
        ruleKey: "delegation:direct-child-only",
        chapter: "4",
        expectedChapter: "3",
        responsibilityKind: "product_behavior",
      },
    ]))
  })
})
