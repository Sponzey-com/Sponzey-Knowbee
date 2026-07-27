import { describe, expect, it } from "vitest"

import {
  type GoalRequirementRecord,
  auditGoalRequirementMatrix,
  createGoalRequirementSkeleton,
  extractGoalNormativeClauses,
  verifyGoalEvidenceOwners,
} from "../packages/core/src/maintenance/goal-requirement-audit.js"

const provenRecord = (overrides: Partial<GoalRequirementRecord> = {}): GoalRequirementRecord => ({
  requirementId: "G-001",
  clauses: ["3.1:1"],
  obligation: "The main agent uses the configured agent name.",
  requiredScopes: ["main_agent"],
  evidence: [
    {
      kind: "authoritative_source",
      owner: "packages/core/src/agent/main-agent-identity.ts",
      assertions: ["configured name is the canonical identity"],
      coveredScopes: ["main_agent"],
    },
    {
      kind: "positive_test",
      owner: "tests/task-intake-self-name.test.ts",
      assertions: ["returns the configured agent name"],
      coveredScopes: ["main_agent"],
    },
    {
      kind: "rejection_test",
      owner: "tests/task-intake-self-name.test.ts",
      assertions: ["does not return the product name after configuration"],
      coveredScopes: ["main_agent"],
    },
  ],
  ...overrides,
})

describe("task1190 GOAL requirement evidence matrix", () => {
  it("extracts stable section-scoped clauses while excluding headings and code examples", () => {
    const markdown = [
      "# Goal",
      "## 3. Rules",
      "The runtime must keep memory isolated.",
      "",
      "- Every agent must have an agent name.",
      "```text",
      "- This example must not become a requirement.",
      "```",
      "## 10. Review Checklist",
      "- Verify that memory remains isolated.",
      "## 11. Open Decisions",
      "- Decide the default retention period. Until then, do not persist memory.",
    ].join("\n")

    const first = extractGoalNormativeClauses(markdown)
    const withBlankLines = extractGoalNormativeClauses(markdown.replace("## 10", "\n\n## 10"))

    expect(first.complete).toBe(true)
    expect(first.clauses.map(({ section, kind, text }) => ({ section, kind, text }))).toEqual([
      { section: "3", kind: "requirement", text: "The runtime must keep memory isolated." },
      { section: "3", kind: "requirement", text: "Every agent must have an agent name." },
      { section: "10", kind: "review_criterion", text: "Verify that memory remains isolated." },
      {
        section: "11",
        kind: "open_decision",
        text: "Decide the default retention period. Until then, do not persist memory.",
      },
    ])
    expect(withBlankLines.clauses.map((clause) => clause.clauseId)).toEqual(
      first.clauses.map((clause) => clause.clauseId),
    )
  })

  it("reports a stable-id collision instead of silently dropping a clause", () => {
    const result = extractGoalNormativeClauses(
      ["## 3. Rules", "- The same rule applies.", "- The same rule applies."].join("\n"),
    )

    expect(result).toMatchObject({
      complete: false,
      diagnostics: [
        {
          code: "clause_id_collision",
          section: "3",
        },
      ],
    })
  })

  it("creates one unproven requirement record per clause without merging obligations", () => {
    const inventory = extractGoalNormativeClauses(
      ["## 3. Rules", "- First obligation.", "- Second obligation."].join("\n"),
    )

    const records = createGoalRequirementSkeleton(inventory.clauses)
    const result = auditGoalRequirementMatrix({
      normativeClauses: inventory.clauses.map((clause) => clause.clauseId),
      records,
    })

    expect(records).toHaveLength(2)
    expect(new Set(records.map((record) => record.requirementId)).size).toBe(2)
    expect(records.map((record) => record.clauses)).toEqual(
      inventory.clauses.map((clause) => [clause.clauseId]),
    )
    expect(result).toMatchObject({
      complete: false,
      counts: { proven: 0, partial: 0, missing: 2, contradicted: 0 },
      diagnostics: [],
    })
  })

  it("proves a uniquely owned requirement with source and executable behavior evidence", () => {
    const result = auditGoalRequirementMatrix({
      normativeClauses: ["3.1:1"],
      records: [provenRecord()],
    })

    expect(result).toEqual({
      complete: true,
      counts: { proven: 1, partial: 0, missing: 0, contradicted: 0 },
      requirements: [
        {
          requirementId: "G-001",
          status: "proven",
          reasonCodes: [],
        },
      ],
      diagnostics: [],
    })
  })

  it("rejects missing and duplicate ownership of normative clauses", () => {
    const result = auditGoalRequirementMatrix({
      normativeClauses: ["3.1:1", "3.1:2", "3.1:3"],
      records: [
        provenRecord(),
        provenRecord({ requirementId: "G-002", clauses: ["3.1:1", "3.1:2"] }),
      ],
    })

    expect(result.complete).toBe(false)
    expect(result.diagnostics).toEqual([
      { code: "clause_owned_multiple_times", clause: "3.1:1", owners: ["G-001", "G-002"] },
      { code: "clause_unowned", clause: "3.1:3", owners: [] },
    ])
  })

  it("keeps filename-only and narrow-scope evidence partial", () => {
    const result = auditGoalRequirementMatrix({
      normativeClauses: ["3.4:1"],
      records: [
        provenRecord({
          requirementId: "G-010",
          clauses: ["3.4:1"],
          requiredScopes: ["main_agent", "sub_agent"],
          evidence: [
            {
              kind: "authoritative_source",
              owner: "packages/core/src/orchestration/hierarchy.ts",
              assertions: ["parent delegates only to direct children"],
              coveredScopes: ["main_agent", "sub_agent"],
            },
            {
              kind: "positive_test",
              owner: "tests/delegation.test.ts",
              assertions: [],
              coveredScopes: ["main_agent"],
            },
          ],
        }),
      ],
    })

    expect(result.requirements).toEqual([
      {
        requirementId: "G-010",
        status: "partial",
        reasonCodes: [
          "positive_test_assertion_missing",
          "rejection_test_missing",
          "scope_uncovered:main_agent",
          "scope_uncovered:sub_agent",
        ],
      },
    ])
  })

  it("marks explicit contradictory evidence instead of hiding it as partial", () => {
    const result = auditGoalRequirementMatrix({
      normativeClauses: ["3.2:1"],
      records: [
        provenRecord({
          clauses: ["3.2:1"],
          evidence: [
            ...provenRecord().evidence,
            {
              kind: "contradiction",
              owner: "packages/core/src/channels/direct-answer.ts",
              assertions: ["returns a deterministic user-facing answer without LLM review"],
              coveredScopes: ["main_agent"],
            },
          ],
        }),
      ],
    })

    expect(result).toMatchObject({
      complete: false,
      counts: { proven: 0, partial: 0, missing: 0, contradicted: 1 },
      requirements: [
        {
          requirementId: "G-001",
          status: "contradicted",
          reasonCodes: ["contradictory_evidence_present"],
        },
      ],
    })
  })

  it("verifies evidence against actual source and test assertion markers", () => {
    const record = provenRecord({
      evidence: provenRecord().evidence.map((evidence) => ({
        ...evidence,
        markers:
          evidence.kind === "authoritative_source"
            ? ["resolveMainAgentName"]
            : ["expect(result.agentName).toBe(configuredName)"],
      })),
    })
    const snapshots = new Map([
      [
        "packages/core/src/agent/main-agent-identity.ts",
        "export function resolveMainAgentName() {}",
      ],
      ["tests/task-intake-self-name.test.ts", "expect(result.agentName).toBe(configuredName)"],
    ])

    const result = verifyGoalEvidenceOwners({
      records: [record],
      readOwner: (owner) => snapshots.get(owner),
    })

    expect(result).toEqual({ complete: true, diagnostics: [] })
  })

  it("rejects missing owners, source/test kind mismatches, and absent markers", () => {
    const result = verifyGoalEvidenceOwners({
      records: [
        provenRecord({
          evidence: [
            {
              kind: "authoritative_source",
              owner: "tests/not-a-source.test.ts",
              assertions: ["source claim"],
              coveredScopes: ["main_agent"],
              markers: ["missingSourceMarker"],
            },
            {
              kind: "positive_test",
              owner: "packages/core/src/not-a-test.ts",
              assertions: ["behavior claim"],
              coveredScopes: ["main_agent"],
              markers: ["missingTestMarker"],
            },
            {
              kind: "rejection_test",
              owner: "tests/missing.test.ts",
              assertions: ["rejection claim"],
              coveredScopes: ["main_agent"],
              markers: ["expect("],
            },
          ],
        }),
      ],
      readOwner: (owner) =>
        owner === "tests/not-a-source.test.ts" || owner === "packages/core/src/not-a-test.ts"
          ? "unrelated content"
          : undefined,
    })

    expect(result).toEqual({
      complete: false,
      diagnostics: [
        {
          code: "evidence_owner_kind_mismatch",
          requirementId: "G-001",
          owner: "packages/core/src/not-a-test.ts",
          marker: "",
        },
        {
          code: "evidence_marker_missing",
          requirementId: "G-001",
          owner: "packages/core/src/not-a-test.ts",
          marker: "missingTestMarker",
        },
        {
          code: "evidence_owner_missing",
          requirementId: "G-001",
          owner: "tests/missing.test.ts",
          marker: "",
        },
        {
          code: "evidence_owner_kind_mismatch",
          requirementId: "G-001",
          owner: "tests/not-a-source.test.ts",
          marker: "",
        },
        {
          code: "evidence_marker_missing",
          requirementId: "G-001",
          owner: "tests/not-a-source.test.ts",
          marker: "missingSourceMarker",
        },
      ],
    })
  })
})
