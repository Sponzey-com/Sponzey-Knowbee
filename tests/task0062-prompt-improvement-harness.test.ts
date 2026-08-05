import { describe, expect, it } from "vitest"
import {
  PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES,
  PROMPT_IMPROVEMENT_MUTABLE_SOURCE_KINDS,
  REQUIRED_HARNESS_GUARDRAILS,
  authorizePromptImprovementMutableSource,
  buildPromptImprovementApprovalRequest,
  canTransitionPromptImprovementHarnessState,
  decidePromptImprovementHarnessInput,
  executeAuthorizedPromptImprovementMutableSource,
  validatePromptImprovementHarnessInput,
  validatePromptImprovementHarnessStateTransition,
  type PromptImprovementApprovalRecord,
  type PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function approvalRecord(overrides: Partial<PromptImprovementApprovalRecord> = {}): PromptImprovementApprovalRecord {
  return {
    approvedBy: "user:prompt-harness-test",
    approvedAt: "2026-07-04T00:00:00.000Z",
    approvalScope: ["apply_change"],
    targetPromptSources: ["prompts/final_response.md"],
    targetHarnessSources: [],
    riskAccepted: "medium",
    ...overrides,
  }
}

function baseInput(overrides: Partial<PromptImprovementHarnessInput> = {}): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Make the final response failure report shorter.",
    improvementKind: "prompt_source",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "user_request",
    targetPromptSources: ["prompts/final_response.md"],
    activeHarnessVersion: "prompt_improvement.md:sha256:abc123",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["final_response"],
    currentBehavior: "Failure reports include repeated background details.",
    desiredBehavior: "Failure reports contain result, reason, and next action only.",
    userReactionEvidence: ["User asked for shorter failure explanations."],
    responseStrategyTarget: "failure_report",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change identity rules."],
    allowedChangeScope: ["prompts/final_response.md"],
    requiredInvariants: ["identity", "safety", "memory_isolation", "harness_integrity", "audit", "activation_boundary", "rollback"],
    requiredTests: ["tests/prompt-source-regression.test.ts"],
    approvalMode: "user_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
    ...overrides,
  }
}

describe("task0062 prompt improvement harness", () => {
  it("requires an identified problem and explicit current and desired behavior", () => {
    expect(validatePromptImprovementHarnessInput(baseInput()).ok).toBe(true)
    for (const field of ["improvementGoal", "currentBehavior", "desiredBehavior"] as const) {
      const result = validatePromptImprovementHarnessInput(baseInput({ [field]: "" }))
      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "required_field_missing",
        path: field,
      }))
    }
  })

  it("returns a typed blocked decision with every missing input field", () => {
    const decision = decidePromptImprovementHarnessInput(baseInput({
      improvementGoal: "",
      requiredTests: [],
      rollbackPlan: "",
    }))
    expect(decision).toMatchObject({
      state: "blocked",
      missingFields: expect.arrayContaining(["improvementGoal", "requiredTests", "rollbackPlan"]),
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "required_field_missing", path: "improvementGoal" }),
        expect.objectContaining({ code: "required_field_missing", path: "requiredTests" }),
        expect.objectContaining({ code: "required_field_missing", path: "rollbackPlan" }),
      ]),
    })
  })

  it.each(PROMPT_IMPROVEMENT_MUTABLE_SOURCE_KINDS)("authorizes exact versioned mutable source kind %s", (sourceKind) => {
    const refs = {
      versioned_prompt_file: "prompts/identity.md",
      prompt_registry_record: "identity:en",
      prompt_metadata: "prompt-metadata:assembly-order",
      prompt_test_fixture: "tests/prompt-source-regression.test.ts",
    } as const
    expect(authorizePromptImprovementMutableSource({
      sourceKind,
      sourceRef: refs[sourceKind],
      baselineVersion: "git:abc1234",
      baselineChecksum: "abcdef12",
      ...(sourceKind === "prompt_test_fixture" ? { fixturePurpose: "validation" as const } : {}),
    })).toMatchObject({ status: "authorized", source: { sourceKind, sourceRef: refs[sourceKind] } })
  })

  it.each([
    ["prompt_registry_record", "identity:en"],
    ["prompt_metadata", "prompt-metadata:assembly-order"],
    ["prompt_test_fixture", "tests/prompt-source-regression.test.ts"],
  ] as const)("applies an authorized %s only through its matching writer", (sourceKind, sourceRef) => {
    let writes = 0
    const authorization = authorizePromptImprovementMutableSource({
      sourceKind,
      sourceRef,
      baselineVersion: "git:abc1234",
      baselineChecksum: "abcdef12",
      ...(sourceKind === "prompt_test_fixture" ? { fixturePurpose: "regression" as const } : {}),
    })
    const audit: unknown[] = []
    expect(executeAuthorizedPromptImprovementMutableSource({
      authorization,
      writerKind: sourceKind,
      auditContext: { runId: "run:1348", actor: "agent:노비", timestamp: 1 },
      recordAudit: (record) => audit.push(record),
      write: (source) => {
        writes += 1
        return source.sourceRef
      },
    })).toMatchObject({ status: "applied", result: sourceRef })
    expect(writes).toBe(1)
    expect(audit).toEqual([expect.objectContaining({ decision: "applied", sourceKind, sourceRef, reasonCode: null })])
  })

  it("blocks cross-kind authorization reuse before invoking a writer", () => {
    let writes = 0
    const audit: unknown[] = []
    const authorization = authorizePromptImprovementMutableSource({
      sourceKind: "prompt_metadata",
      sourceRef: "prompt-metadata:assembly-order",
      baselineVersion: "git:abc1234",
      baselineChecksum: "abcdef12",
    })
    expect(executeAuthorizedPromptImprovementMutableSource({
      authorization,
      writerKind: "prompt_registry_record",
      auditContext: { runId: "run:1348", actor: "agent:노비", timestamp: 1 },
      recordAudit: (record) => audit.push(record),
      write: () => {
        writes += 1
        return "unexpected"
      },
    })).toEqual({ status: "blocked", reasonCode: "writer_kind_mismatch" })
    expect(writes).toBe(0)
    expect(audit).toEqual([expect.objectContaining({ decision: "blocked", reasonCode: "writer_kind_mismatch" })])
  })

  it.each([
    "profile:user-42",
    "memory:user-42:long-term",
    "conversation:active:secret-message",
  ])("rejects non-prompt user data from every mutable source kind: %s", (sourceRef) => {
    for (const sourceKind of PROMPT_IMPROVEMENT_MUTABLE_SOURCE_KINDS) {
      expect(authorizePromptImprovementMutableSource({
        sourceKind,
        sourceRef,
        baselineVersion: "git:abc1234",
        baselineChecksum: "abcdef12",
        ...(sourceKind === "prompt_test_fixture" ? { fixturePurpose: "validation" as const } : {}),
      })).toEqual({ status: "blocked", reasonCode: "source_ref_invalid" })
    }
  })

  it.each(["memory:agent:child:short-term", "agent-memory:child:long-term", "database:unrelated:42", "db:users:42"])(
    "rejects persistence target from allowed change scope: %s",
    (sourceRef) => {
      const result = validatePromptImprovementHarnessInput(baseInput({
        allowedChangeScope: ["prompts/final_response.md", sourceRef],
      }))
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "allowed_change_scope_invalid",
        path: "allowedChangeScope",
      }))
    },
  )

  it("requires an explicit validation or regression purpose for prompt fixtures", () => {
    expect(authorizePromptImprovementMutableSource({
      sourceKind: "prompt_test_fixture",
      sourceRef: "tests/prompt-source-regression.test.ts",
      baselineVersion: "git:abc1234",
      baselineChecksum: "abcdef12",
    })).toEqual({ status: "blocked", reasonCode: "fixture_purpose_invalid" })
  })

  it("records an unauthorized decision without retaining rejected user data", () => {
    const audit: unknown[] = []
    const authorization = authorizePromptImprovementMutableSource({
      sourceKind: "prompt_metadata",
      sourceRef: "profile:user@example.com:secret-token",
      baselineVersion: "git:abc1234",
      baselineChecksum: "abcdef12",
    })
    expect(executeAuthorizedPromptImprovementMutableSource({
      authorization,
      writerKind: "prompt_metadata",
      auditContext: { runId: "run:1348", actor: "agent:노비", timestamp: 1 },
      recordAudit: (record) => audit.push(record),
      write: () => "unexpected",
    })).toEqual({ status: "blocked", reasonCode: "source_not_authorized" })
    expect(audit).toEqual([expect.objectContaining({
      decision: "blocked",
      sourceKind: null,
      sourceRef: null,
      baselineVersion: null,
      baselineChecksum: null,
      reasonCode: "source_not_authorized",
    })])
    expect(JSON.stringify(audit)).not.toContain("user@example.com")
    expect(JSON.stringify(audit)).not.toContain("secret-token")
  })

  it.each([
    ["prompt_registry_record", "identity:*"],
    ["prompt_metadata", "runtime:temperature"],
    ["prompt_test_fixture", "tests/fixtures/all"],
  ] as const)("rejects invalid exact reference for %s", (sourceKind, sourceRef) => {
    expect(authorizePromptImprovementMutableSource({
      sourceKind,
      sourceRef,
      baselineVersion: "git:abc1234",
      baselineChecksum: "abcdef12",
    })).toEqual({ status: "blocked", reasonCode: "source_ref_invalid" })
  })

  it.each(["", "latest", "current", "head"])("rejects mutable source lineage version %s", (baselineVersion) => {
    expect(authorizePromptImprovementMutableSource({
      sourceKind: "prompt_registry_record",
      sourceRef: "identity:en",
      baselineVersion,
      baselineChecksum: "abcdef12",
    })).toEqual({ status: "blocked", reasonCode: "source_version_missing" })
  })

  it.each([
    ["versioned_prompt_file", "packages/core/src/index.ts"],
    ["versioned_prompt_file", ".env"],
    ["versioned_prompt_file", "runtime:active-conversation"],
    ["prompt_registry_record", "all prompts"],
  ] as const)("rejects non-prompt or broad mutable source %s:%s", (sourceKind, sourceRef) => {
    expect(authorizePromptImprovementMutableSource({
      sourceKind,
      sourceRef,
      baselineVersion: "git:abc1234",
      baselineChecksum: "abcdef12",
    })).toEqual({ status: "blocked", reasonCode: "source_ref_invalid" })
  })

  it.each(["Improve prompts.", "개선", "Fix prompt.\nUpdate safety.", "1. Fix identity 2. Change tools"])(
    "rejects a non-specific or multi-goal improvement goal: %s",
    (improvementGoal) => {
      const result = validatePromptImprovementHarnessInput(baseInput({ improvementGoal }))
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "improvement_goal_not_specific",
        path: "improvementGoal",
      }))
    },
  )

  it.each(["prompt_source", "prompt_metadata", "harness_rule", "harness_state_machine", "harness_test_fixture"] as const)(
    "recognizes supported improvement kind %s at runtime",
    (improvementKind) => {
      const input = baseInput({ improvementKind })
      const result = validatePromptImprovementHarnessInput(input)
      expect(result.issues).not.toContainEqual(expect.objectContaining({ code: "improvement_kind_invalid" }))
    },
  )

  it("rejects unsupported improvement kinds and agent types at runtime", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      improvementKind: "everything" as PromptImprovementHarnessInput["improvementKind"],
      improvingAgentType: "worker" as PromptImprovementHarnessInput["improvingAgentType"],
    }))
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "improvement_kind_invalid", path: "improvementKind" }),
      expect.objectContaining({ code: "improving_agent_type_invalid", path: "improvingAgentType" }),
    ]))
  })

  it("accepts user-facing main and sub-agent names but rejects internal agent IDs", () => {
    expect(validatePromptImprovementHarnessInput(baseInput({ improvingAgentName: "노비", improvingAgentType: "main" })).issues)
      .not.toContainEqual(expect.objectContaining({ code: "improving_agent_name_invalid" }))
    expect(validatePromptImprovementHarnessInput(baseInput({
      improvingAgentName: "조사 담당",
      improvingAgentType: "sub_agent",
      parentReviewerAgentName: "노비",
      approvalRecord: approvalRecord({ approvedBy: "노비" }),
    })).issues).not.toContainEqual(expect.objectContaining({ code: "improving_agent_name_invalid" }))
    expect(validatePromptImprovementHarnessInput(baseInput({ improvingAgentName: "agent:internal-main" })).issues)
      .toContainEqual(expect.objectContaining({ code: "improving_agent_name_invalid", path: "improvingAgentName" }))
  })

  it("requires a user-facing parent reviewer whose name matches sub-agent approval", () => {
    const missing = validatePromptImprovementHarnessInput(baseInput({
      improvingAgentType: "sub_agent",
      parentReviewerAgentName: "",
    }))
    const internal = validatePromptImprovementHarnessInput(baseInput({
      improvingAgentType: "sub_agent",
      parentReviewerAgentName: "agent:main",
    }))
    const mismatch = validatePromptImprovementHarnessInput(baseInput({
      improvingAgentType: "sub_agent",
      parentReviewerAgentName: "노비",
      approvalRecord: approvalRecord({ approvedBy: "다른 관리자" }),
    }))
    expect(missing.issues).toContainEqual(expect.objectContaining({ code: "sub_agent_parent_reviewer_missing" }))
    expect(internal.issues).toContainEqual(expect.objectContaining({ code: "sub_agent_parent_reviewer_invalid" }))
    expect(mismatch.issues).toContainEqual(expect.objectContaining({ code: "sub_agent_parent_reviewer_mismatch" }))
  })

  it.each([
    "prompt_improvement.md:sha256:abc123",
    "prompt_improvement:sha256:abc123",
    "prompt_improvement:version:v2",
  ])("accepts verifiable active harness version ref %s", (activeHarnessVersion) => {
    expect(validatePromptImprovementHarnessInput(baseInput({ activeHarnessVersion })).issues)
      .not.toContainEqual(expect.objectContaining({ code: "active_harness_version_invalid" }))
  })

  it.each(["latest", "prompt_improvement.md", "sha256:abc123", "all harnesses"])(
    "rejects unverifiable active harness version %s",
    (activeHarnessVersion) => {
      expect(validatePromptImprovementHarnessInput(baseInput({ activeHarnessVersion })).issues)
        .toContainEqual(expect.objectContaining({ code: "active_harness_version_invalid" }))
    },
  )

  it("rejects broad, malformed, and duplicate harness source targets", () => {
    const harnessBase = {
      improvementKind: "harness_rule" as const,
      targetPromptSources: [],
      harnessChangeScope: ["entry_conditions"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
      approvalMode: "admin_required" as const,
    }
    const invalid = validatePromptImprovementHarnessInput(baseInput({
      ...harnessBase,
      targetHarnessSources: ["packages/core/src/memory/*"],
    }))
    const duplicate = validatePromptImprovementHarnessInput(baseInput({
      ...harnessBase,
      targetHarnessSources: [
        "packages/core/src/memory/prompt-improvement-harness.ts",
        "packages/core/src/memory/prompt-improvement-harness.ts",
      ],
    }))
    expect(invalid.issues).toContainEqual(expect.objectContaining({ code: "harness_source_invalid_ref" }))
    expect(duplicate.issues).toContainEqual(expect.objectContaining({ code: "harness_source_duplicate" }))
  })

  it.each(PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES)(
    "accepts canonical harness change scope %s",
    (scope) => {
      const result = validatePromptImprovementHarnessInput(baseInput({
        improvementKind: "harness_rule",
        targetPromptSources: [],
        targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        harnessChangeScope: [scope],
        harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
        approvalMode: "admin_required",
        approvalRecord: approvalRecord({
          approvalScope: ["apply_change", "activation"],
          targetPromptSources: [],
          targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
          riskAccepted: "high",
        }),
      }))

      expect(result.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "harness_change_scope_invalid" }),
        expect.objectContaining({ code: "harness_change_scope_duplicate" }),
      ]))
    },
  )

  it("rejects unsupported and duplicate harness scope and guardrail values", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      improvementKind: "harness_rule",
      targetPromptSources: [],
      targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      allowedChangeScope: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      harnessChangeScope: ["entry_conditions", "entry_conditions", "unknown_scope"],
      harnessGuardrailsToPreserve: [
        ...REQUIRED_HARNESS_GUARDRAILS,
        "approval",
        "unknown_guardrail",
      ],
      approvalMode: "admin_required",
    }))

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "harness_change_scope_duplicate", path: "harnessChangeScope" }),
      expect.objectContaining({ code: "harness_change_scope_invalid", path: "harnessChangeScope" }),
      expect.objectContaining({ code: "harness_guardrail_duplicate", path: "harnessGuardrailsToPreserve" }),
      expect.objectContaining({ code: "harness_guardrail_invalid", path: "harnessGuardrailsToPreserve" }),
    ]))
  })

  it("requires exact prompt source targets for prompt source improvements", () => {
    const missing = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: [],
    }))
    const broad = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: ["all prompts"],
    }))

    expect(missing.ok).toBe(false)
    expect(missing.issues).toContainEqual(expect.objectContaining({
      code: "target_prompt_source_missing",
      path: "targetPromptSources",
    }))
    expect(broad.ok).toBe(false)
    expect(broad.issues).toContainEqual(expect.objectContaining({
      code: "target_prompt_source_too_broad",
      path: "targetPromptSources.0",
    }))
  })

  it("rejects prompt source targets outside the allowed change scope", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: ["prompts/final_response.md"],
      allowedChangeScope: ["prompts/identity.md"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "target_prompt_source_outside_allowed_scope",
      path: "targetPromptSources",
    }))
  })

  it("requires exact unique allowed change sources that cover every target", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      allowedChangeScope: ["prompts/*", "prompts/final_response.md", "prompts/final_response.md"],
    }))
    const uncovered = validatePromptImprovementHarnessInput(baseInput({
      allowedChangeScope: ["prompts/identity.md"],
    }))

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "allowed_change_scope_invalid", path: "allowedChangeScope" }),
      expect.objectContaining({ code: "allowed_change_scope_duplicate", path: "allowedChangeScope" }),
    ]))
    expect(uncovered.issues).toContainEqual(expect.objectContaining({
      code: "target_prompt_source_outside_allowed_scope",
      path: "targetPromptSources",
    }))
  })

  it("rejects vague, duplicate, and goal-conflicting non-goals", () => {
    const vague = validatePromptImprovementHarnessInput(baseInput({ nonGoals: ["none"] }))
    const duplicate = validatePromptImprovementHarnessInput(baseInput({
      nonGoals: ["Do not change identity rules.", "Do not change identity rules."],
    }))
    const conflict = validatePromptImprovementHarnessInput(baseInput({
      nonGoals: [baseInput().improvementGoal],
    }))

    expect(vague.issues).toContainEqual(expect.objectContaining({ code: "non_goal_invalid" }))
    expect(duplicate.issues).toContainEqual(expect.objectContaining({ code: "non_goal_duplicate" }))
    expect(conflict.issues).toContainEqual(expect.objectContaining({ code: "non_goal_conflict" }))
  })

  it("requires closed unique invariants derived from declared impact", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      impactAssessment: { changeKind: "behavior_change", impactAxes: ["identity", "memory", "tool", "activation"] },
      requiredInvariants: ["identity", "identity", "unknown_invariant"],
    }))

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "required_invariant_duplicate", path: "requiredInvariants" }),
      expect.objectContaining({ code: "required_invariant_invalid", path: "requiredInvariants" }),
      expect.objectContaining({ code: "required_invariant_missing", path: "requiredInvariants" }),
    ]))
    expect(result.issues.find((issue) => issue.code === "required_invariant_missing")?.message)
      .toMatch(/memory_isolation, tool_mcp, activation_boundary, rollback/u)
  })

  it("requires exact unique regression test references", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      requiredTests: ["all tests", "tests/prompt-source-regression.test.ts", "tests/prompt-source-regression.test.ts"],
    }))
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "required_test_invalid", path: "requiredTests" }),
      expect.objectContaining({ code: "required_test_duplicate", path: "requiredTests" }),
    ]))
  })

  it("derives minimum approval mode from assessed risk", () => {
    const highWithUserApproval = validatePromptImprovementHarnessInput(baseInput({
      riskLevel: "high",
      impactAssessment: { changeKind: "behavior_change", impactAxes: ["identity"] },
      approvalMode: "user_required",
      approvalRecord: approvalRecord({ riskAccepted: "high" }),
    }))
    const highWithAdminApproval = validatePromptImprovementHarnessInput(baseInput({
      riskLevel: "high",
      impactAssessment: { changeKind: "behavior_change", impactAxes: ["identity"] },
      approvalMode: "admin_required",
      approvalRecord: approvalRecord({ riskAccepted: "high" }),
    }))
    expect(highWithUserApproval.issues).toContainEqual(expect.objectContaining({
      code: "approval_mode_risk_mismatch",
      path: "approvalMode",
    }))
    expect(highWithAdminApproval.issues).not.toContainEqual(expect.objectContaining({
      code: "approval_mode_risk_mismatch",
    }))
  })

  it("requires rollback plans to identify a restore action and exact source or version", () => {
    for (const rollbackPlan of ["Restore the previous version.", "Use latest", "Restore from git:HEAD."]) {
      expect(validatePromptImprovementHarnessInput(baseInput({ rollbackPlan })).issues)
        .toContainEqual(expect.objectContaining({ code: "rollback_plan_invalid", path: "rollbackPlan" }))
    }
    expect(validatePromptImprovementHarnessInput(baseInput({
      rollbackPlan: "Restore prompts/final_response.md from prompt-registry:final_response:v12.",
    })).issues).not.toContainEqual(expect.objectContaining({ code: "rollback_plan_invalid" }))
  })

  it("rejects non-prompt files as prompt source improvement targets", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      allowedChangeScope: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      agentOwnedPromptScope: ["prompt_improvement_harness"],
      approvalRecord: approvalRecord({
        targetPromptSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      }),
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "target_prompt_source_invalid_ref",
      path: "targetPromptSources.0",
    }))
  })

  it("rejects prompt source targets outside the improving agent owned scope", () => {
    const identity = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: ["identity:en"],
      allowedChangeScope: ["identity:en"],
      agentOwnedPromptScope: ["final_response"],
      approvalRecord: approvalRecord({
        targetPromptSources: ["identity:en"],
      }),
    }))
    const finalResponse = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: ["prompts/final_response.md"],
      allowedChangeScope: ["prompts/final_response.md"],
      agentOwnedPromptScope: ["identity"],
    }))

    expect(identity.ok).toBe(false)
    expect(identity.issues).toContainEqual(expect.objectContaining({
      code: "target_prompt_source_outside_agent_scope",
      path: "targetPromptSources",
    }))
    expect(finalResponse.ok).toBe(false)
    expect(finalResponse.issues).toContainEqual(expect.objectContaining({
      code: "target_prompt_source_outside_agent_scope",
      path: "targetPromptSources",
    }))
  })

  it("rejects broad or unowned response strategy targets", () => {
    const broad = validatePromptImprovementHarnessInput(baseInput({
      responseStrategyTarget: "all prompts",
    }))
    const unowned = validatePromptImprovementHarnessInput(baseInput({
      agentOwnedPromptScope: ["final_response"],
      responseStrategyTarget: "unreviewed_new_strategy",
    }))

    expect(broad.ok).toBe(false)
    expect(broad.issues).toContainEqual(expect.objectContaining({
      code: "response_strategy_target_too_broad",
      path: "responseStrategyTarget",
    }))
    expect(unowned.ok).toBe(false)
    expect(unowned.issues).toContainEqual(expect.objectContaining({
      code: "response_strategy_target_not_owned",
      path: "responseStrategyTarget",
    }))
  })

  it("requires evidence for prompt improvement response strategy changes", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      userReactionEvidence: [],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "required_field_missing",
      path: "userReactionEvidence",
    }))
  })

  it("accepts known response strategy targets and owned prompt module targets", () => {
    const known = validatePromptImprovementHarnessInput(baseInput({
      responseStrategyTarget: "failure_report",
    }))
    const owned = validatePromptImprovementHarnessInput(baseInput({
      agentOwnedPromptScope: ["custom_agent_module", "final_response"],
      responseStrategyTarget: "custom_agent_module",
    }))

    expect(known.issues).not.toContainEqual(expect.objectContaining({
      path: "responseStrategyTarget",
    }))
    expect(owned.issues).not.toContainEqual(expect.objectContaining({
      path: "responseStrategyTarget",
    }))
  })

  it("accepts supported exact prompt source reference forms", () => {
    const registryRef = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: ["identity:en"],
      allowedChangeScope: ["identity:en"],
      agentOwnedPromptScope: ["identity"],
      responseStrategyTarget: "identity",
      approvalRecord: approvalRecord({
        targetPromptSources: ["identity:en"],
      }),
    }))
    const fileRef = validatePromptImprovementHarnessInput(baseInput({
      targetPromptSources: ["prompts/final_response.md"],
      allowedChangeScope: ["prompts/final_response.md"],
      agentOwnedPromptScope: ["final_response"],
      responseStrategyTarget: "final_response",
    }))

    expect(registryRef.issues).not.toContainEqual(expect.objectContaining({
      code: "target_prompt_source_invalid_ref",
    }))
    expect(fileRef.issues).not.toContainEqual(expect.objectContaining({
      code: "target_prompt_source_invalid_ref",
    }))
  })

  it("requires approval mode for medium or high risk prompt improvements", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      approvalMode: "none",
      approvalRecord: undefined,
    }))

    expect(result.risk).toBe("medium")
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "approval_required",
      path: "approvalMode",
    }))
  })

  it("builds a structured approval request for prompt-source improvements", () => {
    const harnessInput = baseInput()
    const validation = validatePromptImprovementHarnessInput(harnessInput)
    const request = buildPromptImprovementApprovalRequest({
      harnessInput,
      validation,
      changeSummary: "Shorten final response failure reports.",
      invariantsAffected: ["identity", "memory_isolation"],
      activationMethod: "restart",
      approvalScopesRequested: ["apply_change"],
    })

    expect(request).toEqual({
      targetFiles: ["prompts/final_response.md"],
      changeSummary: "Shorten final response failure reports.",
      riskLevel: "medium",
      invariantsAffected: ["identity", "memory_isolation"],
      testsToRun: ["tests/prompt-source-regression.test.ts"],
      rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
      activationMethod: "restart",
      harnessChangeScope: [],
      harnessGuardrailsToPreserve: [],
      approvalMode: "user_required",
      approvalScopesRequested: ["apply_change"],
      activationIncluded: false,
    })
  })

  it("builds harness approval requests with preserved guardrails and activation scope", () => {
    const harnessInput = baseInput({
      improvementKind: "harness_rule",
      targetPromptSources: [],
      targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      allowedChangeScope: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      harnessChangeScope: ["approval_policy"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
      approvalMode: "admin_required",
      approvalRecord: approvalRecord({
        approvalScope: ["apply_change", "activation"],
        targetPromptSources: [],
        targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        riskAccepted: "high",
      }),
    })
    const validation = validatePromptImprovementHarnessInput(harnessInput)
    const request = buildPromptImprovementApprovalRequest({
      harnessInput,
      validation,
      changeSummary: "Require explicit entry policy for harness changes.",
      invariantsAffected: ["approval", "activation_confirmation"],
      activationMethod: "registry_activation",
      approvalScopesRequested: ["apply_change", "activation"],
    })

    expect(validation.ok).toBe(true)
    expect(validation.issues).not.toContainEqual(expect.objectContaining({
      code: "target_prompt_source_outside_allowed_scope",
    }))
    expect(request).toMatchObject({
      targetFiles: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      riskLevel: "high",
      harnessChangeScope: ["approval_policy"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
      approvalMode: "admin_required",
      approvalScopesRequested: ["apply_change", "activation"],
      activationIncluded: true,
    })
  })

  it("treats harness improvements as high-risk and requires admin approval guardrails", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      improvementKind: "harness_state_machine",
      targetPromptSources: [],
      targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      harnessChangeScope: ["state_machine"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
      approvalMode: "user_required",
    }))

    expect(result.risk).toBe("high")
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "harness_admin_approval_required",
      path: "approvalMode",
    }))
  })

  it("allows harness improvements only from explicit user or administrator requests", () => {
    for (const triggerSource of ["regression_failure", "safety_review", "product_gap"] as const) {
      const result = validatePromptImprovementHarnessInput(baseInput({
        improvementKind: "harness_rule",
        triggerSource,
        targetPromptSources: [],
        targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        harnessChangeScope: ["entry_conditions"],
        harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
        approvalMode: "admin_required",
        approvalRecord: approvalRecord({
          approvalScope: ["apply_change", "activation"],
          targetPromptSources: [],
          targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
          riskAccepted: "high",
        }),
      }))

      expect(result.risk).toBe("high")
      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "harness_explicit_request_required",
        path: "triggerSource",
      }))
    }
  })

  it("rejects harness-only fields on ordinary prompt improvements", () => {
    const result = validatePromptImprovementHarnessInput(baseInput({
      targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      harnessChangeScope: ["entry_conditions"],
      harnessGuardrailsToPreserve: ["approval"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "harness_field_not_allowed",
        path: "targetHarnessSources",
      }),
      expect.objectContaining({
        code: "harness_field_not_allowed",
        path: "harnessChangeScope",
      }),
      expect.objectContaining({
        code: "harness_field_not_allowed",
        path: "harnessGuardrailsToPreserve",
      }),
    ]))
  })

  it("requires non-goals and activation approval for harness changes", () => {
    const missingNonGoals = validatePromptImprovementHarnessInput(baseInput({
      nonGoals: [],
    }))
    const missingActivationApproval = validatePromptImprovementHarnessInput(baseInput({
      improvementKind: "harness_rule",
      targetPromptSources: [],
      targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      harnessChangeScope: ["approval_policy"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
      approvalMode: "admin_required",
      approvalRecord: approvalRecord({
        approvalScope: ["apply_change"],
        targetPromptSources: [],
        targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        riskAccepted: "high",
      }),
    }))

    expect(missingNonGoals.ok).toBe(false)
    expect(missingNonGoals.issues).toContainEqual(expect.objectContaining({
      code: "required_field_missing",
      path: "nonGoals",
    }))
    expect(missingActivationApproval.ok).toBe(false)
    expect(missingActivationApproval.issues).toContainEqual(expect.objectContaining({
      code: "approval_scope_missing",
      path: "approvalRecord.approvalScope",
    }))
  })

  it("blocks activation before test execution and activation-pending confirmation", () => {
    expect(canTransitionPromptImprovementHarnessState("source_discovery", "baseline_capture")).toBe(true)
    expect(canTransitionPromptImprovementHarnessState("apply_change", "test_execution")).toBe(true)
    expect(canTransitionPromptImprovementHarnessState("test_execution", "activation_pending")).toBe(true)
    expect(canTransitionPromptImprovementHarnessState("activation_pending", "activated")).toBe(true)
    expect(canTransitionPromptImprovementHarnessState("apply_change", "activated")).toBe(false)
    expect(validatePromptImprovementHarnessStateTransition("apply_change", "activated")).toEqual([
      expect.objectContaining({
        code: "invalid_state_transition",
        path: "state",
      }),
    ])
  })
})
