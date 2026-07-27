import { describe, expect, it, vi } from "vitest"
import {
  authorizePromptImprovementApprovalScope,
  PROMPT_IMPROVEMENT_EXECUTION_CRITERIA,
  PROMPT_IMPROVEMENT_CRITICAL_RULE_CATEGORIES,
  REQUIRED_HARNESS_GUARDRAILS,
  validatePromptImprovementDiffAssessment,
  writeApprovedReviewablePromptDiff,
  type PromptImprovementApprovalRecord,
  type PromptImprovementDiffAssessment,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function assessment(overrides: Partial<PromptImprovementDiffAssessment> = {}): PromptImprovementDiffAssessment {
  return {
    targetFiles: ["prompts/final_response.md"],
    changedSections: ["Failure report wording"],
    changedLineCount: 12,
    maxReviewableLineCount: 80,
    unrelatedSectionsRewritten: false,
    outsideTargetModuleRules: [],
    duplicatedCanonicalRules: [],
    copiedRulesWithoutReferences: [],
    multiFileRuleDefinitions: [],
    weakensCriticalRules: [],
    broadenedAccess: [],
    removedApprovalRuleKeys: [],
    removedStopConditionRuleKeys: [],
    broadensToolMcpOrExternalAccess: false,
    removesApprovalRequirements: false,
    removesStopConditions: false,
    removedHarnessGuardrails: [],
    weakensHarnessGuardrails: [],
    currentRunHarnessApplications: [],
    appliesChangedHarnessToCurrentRun: false,
    appliesChangedPromptToCurrentRun: false,
    ambiguousWordingEvidence: [],
    ambiguousWording: [],
    unverifiableWordingEvidence: [],
    missingExecutionCriterionEvidence: [],
    missingExecutionCriteria: [],
    repeatedRuleEvidence: [],
    repetitiveRules: [],
    overloadedRuleSentenceEvidence: [],
    overloadedRuleSentences: [],
    nonEnglishSystemInstructionEvidence: [],
    addsNonEnglishSystemInstructions: false,
    userLanguageRuleWeakeningEvidence: [],
    weakensUserLanguageRule: false,
    weakensFinalResponseLlmBoundary: false,
    promptSourceConflictEvidence: [],
    conflictsWithPromptSources: [],
    assemblyDuplicateDefinitionEvidence: [],
    duplicatedAssemblyDefinitions: [],
    defaultAgentNameChangeEvidence: [],
    changesDefaultAgentNames: false,
    nameTestsUpdated: false,
    impliedRuntimeActivationEvidence: [],
    impliesRuntimeActivation: false,
    removedAuditRollbackProtectionEvidence: [],
    removesAuditOrRollback: false,
    broadRewrite: false,
    broadRewriteArchitectureNoteReceipt: undefined,
    broadRewriteArchitectureNote: "",
    ...overrides,
  }
}

describe("task0768 prompt improvement diff limit validator", () => {
  it("accepts a small targeted diff assessment", () => {
    expect(validatePromptImprovementDiffAssessment(assessment())).toEqual({
      ok: true,
      issues: [],
    })
  })

  it("requires an architecture note for broad rewrites", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      broadRewrite: true,
      broadRewriteArchitectureNote: "",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_broad_rewrite_note_missing",
      path: "broadRewriteArchitectureNote",
    }))
  })

  it("rejects an incomplete broad-rewrite architecture note receipt", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      broadRewrite: true,
      broadRewriteArchitectureNoteReceipt: {
        artifactRef: ".tasks/architecture/prompt-rewrite.md",
        smallDiffInsufficiencyRationale: "",
        reviewedBy: "reviewer:prompt-owner",
      },
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_broad_rewrite_note_missing",
      path: "broadRewriteArchitectureNoteReceipt",
    }))
  })

  it("accepts a broad rewrite with a complete separate architecture note receipt", () => {
    expect(validatePromptImprovementDiffAssessment(assessment({
      broadRewrite: true,
      broadRewriteArchitectureNoteReceipt: {
        artifactRef: ".tasks/architecture/prompt-rewrite.md",
        smallDiffInsufficiencyRationale: "The canonical ownership boundary changes across three modules.",
        reviewedBy: "reviewer:prompt-owner",
      },
    }))).toEqual({ ok: true, issues: [] })
  })

  it("rejects a diff that exceeds its explicit reviewability limit", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      changedLineCount: 81,
      maxReviewableLineCount: 80,
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_too_large",
      path: "changedLineCount",
    }))
  })

  it.each([
    [{ unrelatedSectionsRewritten: true }, "diff_unrelated_rewrite", "unrelatedSectionsRewritten"],
    [{ outsideTargetModuleRules: ["identity rule in final_response"] }, "diff_outside_module", "outsideTargetModuleRules"],
    [{ duplicatedCanonicalRules: ["identity.self_name"] }, "diff_duplicate_rule", "duplicatedCanonicalRules"],
  ] as const)("rejects ownership-invalid diff %s", (change, code, path) => {
    const result = validatePromptImprovementDiffAssessment(assessment(change))
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code, path }))
  })

  it("rejects guardrail weakening, access expansion, ambiguous wording, and activation shortcuts", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      unrelatedSectionsRewritten: true,
      outsideTargetModuleRules: ["identity rule in final_response.md"],
      weakensCriticalRules: [{ category: "memory", ruleKey: "memory.isolation" }],
      broadensToolMcpOrExternalAccess: true,
      ambiguousWording: ["appropriately"],
      addsNonEnglishSystemInstructions: true,
      changesDefaultAgentNames: true,
      nameTestsUpdated: false,
      impliesRuntimeActivation: true,
      removesAuditOrRollback: true,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "diff_unrelated_rewrite", path: "unrelatedSectionsRewritten" }),
      expect.objectContaining({ code: "diff_outside_module", path: "outsideTargetModuleRules" }),
      expect.objectContaining({ code: "diff_critical_rule_weakening", path: "weakensCriticalRules" }),
      expect.objectContaining({ code: "diff_access_broadened", path: "broadensToolMcpOrExternalAccess" }),
      expect.objectContaining({ code: "diff_ambiguous_wording", path: "ambiguousWording" }),
      expect.objectContaining({ code: "diff_non_english_system_instruction", path: "addsNonEnglishSystemInstructions" }),
      expect.objectContaining({ code: "diff_agent_name_tests_missing", path: "nameTestsUpdated" }),
      expect.objectContaining({ code: "diff_activation_implied", path: "impliesRuntimeActivation" }),
      expect.objectContaining({ code: "diff_audit_rollback_removed", path: "removesAuditOrRollback" }),
    ]))
  })

  it("rejects current-run prompt activation and weakening the LLM final-response boundary", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      appliesChangedPromptToCurrentRun: true,
      weakensFinalResponseLlmBoundary: true,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "diff_current_run_prompt_application",
        path: "appliesChangedPromptToCurrentRun",
      }),
      expect.objectContaining({
        code: "diff_final_response_llm_boundary_weakened",
        path: "weakensFinalResponseLlmBoundary",
      }),
    ]))
  })

  it.each([
    [
      { broadenedAccess: [{ kind: "tool", capability: "shell_exec" }] },
      "diff_access_broadened",
      "broadenedAccess",
    ],
    [
      { broadenedAccess: [{ kind: "mcp", capability: "filesystem.write" }] },
      "diff_access_broadened",
      "broadenedAccess",
    ],
    [
      { removedApprovalRuleKeys: ["tool.approval_required"] },
      "diff_approval_removed",
      "removedApprovalRuleKeys",
    ],
    [
      { removedStopConditionRuleKeys: ["recovery.safe_exhaustion"] },
      "diff_stop_condition_removed",
      "removedStopConditionRuleKeys",
    ],
  ] as const)("rejects typed access, approval, or stop-condition evidence %#", (change, code, path) => {
    const result = validatePromptImprovementDiffAssessment(assessment(change))
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code, path }))
  })

  it.each([
    { broadenedAccess: [{ kind: "external_capability", capability: "remote.desktop" }] },
    { removedApprovalRuleKeys: ["yeonjang.action_approval"] },
    { removedStopConditionRuleKeys: ["prompt_improvement.failed_state"] },
  ] as const)("does not write a policy-weakening typed diff %#", async (change) => {
    const write = vi.fn(async () => "saved")
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: { status: "authorized", scope: "apply_change", approvedBy: "admin:owner" },
      diffAssessment: assessment(change),
      write,
    })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
  })

  it("rejects harness weakening and repetitive or overloaded prompt rules", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      weakensHarnessGuardrails: ["removes audit log verification"],
      missingExecutionCriteria: ["completion criterion"],
      repetitiveRules: ["duplicates the retry rule"],
      overloadedRuleSentences: ["combines authorization, execution, and completion"],
      duplicatedCanonicalRules: ["tool authorization"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "diff_harness_guardrail_weakening", path: "weakensHarnessGuardrails" }),
      expect.objectContaining({ code: "diff_execution_criteria_missing", path: "missingExecutionCriteria" }),
      expect.objectContaining({ code: "diff_repetitive_rule", path: "repetitiveRules" }),
      expect.objectContaining({ code: "diff_overloaded_rule_sentence", path: "overloadedRuleSentences" }),
      expect.objectContaining({ code: "diff_duplicate_rule", path: "duplicatedCanonicalRules" }),
    ]))
  })

  it.each(REQUIRED_HARNESS_GUARDRAILS)("rejects removal of required harness guardrail %s", (guardrail) => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      removedHarnessGuardrails: [{ guardrail, ruleKey: `harness.${guardrail}` }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_harness_guardrail_weakening",
      path: "removedHarnessGuardrails",
    }))
  })

  it("defines all eight non-removable harness guardrails", () => {
    expect(REQUIRED_HARNESS_GUARDRAILS).toEqual([
      "entry_conditions",
      "required_inputs",
      "invariants",
      "approval",
      "regression_tests",
      "audit_log",
      "rollback",
      "activation_confirmation",
    ])
  })

  it("rejects typed current-run harness application evidence", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      currentRunHarnessApplications: [{
        harnessSource: "packages/core/src/memory/prompt-improvement-harness.ts",
        runId: "run:current",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_current_run_harness_application",
      path: "currentRunHarnessApplications",
    }))
  })

  it("rejects ambiguous wording with exact source evidence", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      ambiguousWordingEvidence: [{
        source: "prompts/prompt_improvement.md",
        section: "Rules",
        phrase: "Handle it appropriately later.",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_ambiguous_wording",
      path: "ambiguousWordingEvidence",
    }))
  })

  it("rejects unverifiable wording separately from ambiguous wording", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      unverifiableWordingEvidence: [{
        source: "prompts/result_review.md",
        section: "Validation",
        phrase: "Verify the result sufficiently.",
        missingCriterion: "No observable pass condition is defined.",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_unverifiable_wording",
      path: "unverifiableWordingEvidence",
    }))
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: "diff_ambiguous_wording" }))
  })

  it.each(PROMPT_IMPROVEMENT_EXECUTION_CRITERIA)(
    "rejects missing execution criterion %s",
    (criterion) => {
      const result = validatePromptImprovementDiffAssessment(assessment({
        missingExecutionCriterionEvidence: [{
          source: "prompts/workflow.md",
          section: "Step Contract",
          criterion,
        }],
      }))
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "diff_execution_criteria_missing",
        path: "missingExecutionCriterionEvidence",
      }))
    },
  )

  it("rejects repeated rules with canonical owner evidence", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      repeatedRuleEvidence: [{
        canonicalRuleKey: "identity.self_name",
        canonicalOwner: "prompts/identity.md",
        duplicateSource: "prompts/final_response.md",
        duplicateSection: "Identity",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_repetitive_rule",
      path: "repeatedRuleEvidence",
    }))
  })

  it("rejects an overloaded sentence with combined canonical rules", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      overloadedRuleSentenceEvidence: [{
        source: "prompts/tool_policy.md",
        section: "Rules",
        sentence: "Authorize, execute, validate, report, and activate the change.",
        combinedRuleKeys: ["tool.authorization", "result.validation", "prompt.activation"],
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_overloaded_rule_sentence",
      path: "overloadedRuleSentenceEvidence",
    }))
  })

  it("rejects a non-English system instruction with detected language evidence", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      nonEnglishSystemInstructionEvidence: [{
        source: "prompts/system.md",
        section: "Rules",
        instruction: "사용자의 요청을 처리한다.",
        detectedLanguage: "ko",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_non_english_system_instruction",
      path: "nonEnglishSystemInstructionEvidence",
    }))
  })

  it("rejects weakening the exact user-language response rule", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      userLanguageRuleWeakeningEvidence: [{
        canonicalRuleKey: "final_response.user_question_language_only",
        changedSource: "prompts/final_response.md",
        weakeningSummary: "Allows a configured default language to override the user question language.",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_user_language_rule_weakened",
      path: "userLanguageRuleWeakeningEvidence",
    }))
  })

  it("rejects a conflict with an exact canonical prompt owner", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      promptSourceConflictEvidence: [{
        changedSource: "prompts/final_response.md",
        changedRuleKey: "identity.self_name.override",
        canonicalSource: "prompts/identity.md",
        canonicalRuleKey: "identity.self_name",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_prompt_source_conflict",
      path: "promptSourceConflictEvidence",
    }))
  })

  it("rejects a definition contributed by multiple assembly sources", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      assemblyDuplicateDefinitionEvidence: [{
        definitionKey: "identity.self_name",
        contributingSources: ["prompts/identity.md", "prompts/final_response.md"],
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_assembly_definition_duplicate",
      path: "assemblyDuplicateDefinitionEvidence",
    }))
  })

  it("rejects a default agent-name change when any required test is missing", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      defaultAgentNameChangeEvidence: [{
        beforeName: "Knowbee",
        afterName: "Helper",
        affectedLocale: "en",
        requiredTestIds: ["assistant-name-default-en", "assistant-name-configured-en"],
        updatedTestIds: ["assistant-name-default-en"],
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_agent_name_tests_missing",
      path: "defaultAgentNameChangeEvidence",
    }))
  })

  it("accepts complete test coverage for a default agent-name change", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      defaultAgentNameChangeEvidence: [{
        beforeName: "Knowbee",
        afterName: "Helper",
        affectedLocale: "en",
        requiredTestIds: ["assistant-name-default-en", "assistant-name-configured-en"],
        updatedTestIds: ["assistant-name-configured-en", "assistant-name-default-en"],
      }],
    }))
    expect(result).toEqual({ ok: true, issues: [] })
  })

  it("rejects implied activation with exact source and missing confirmation", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      impliedRuntimeActivationEvidence: [{
        changedSource: "prompts/prompt_improvement.md",
        activationPath: "runtime.reload.current",
        missingConfirmation: "activation approval receipt",
      }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_activation_implied",
      path: "impliedRuntimeActivationEvidence",
    }))
  })

  it.each(["audit", "rollback"] as const)("rejects removed %s protection", (kind) => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      removedAuditRollbackProtectionEvidence: [{ kind, ruleKey: `${kind}.required` }],
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "diff_audit_rollback_removed",
      path: "removedAuditRollbackProtectionEvidence",
    }))
  })

  it.each([
    {
      removedHarnessGuardrails: [{
        guardrail: "activation_confirmation",
        ruleKey: "harness.activation_confirmation",
      }],
    },
    {
      currentRunHarnessApplications: [{
        harnessSource: "packages/core/src/memory/prompt-improvement-harness.ts",
        runId: "run:current",
      }],
    },
    {
      ambiguousWordingEvidence: [{
        source: "prompts/prompt_improvement.md",
        section: "Rules",
        phrase: "Use when appropriate.",
      }],
    },
  ] as const)("does not write a typed harness-policy violation %#", async (change) => {
    const write = vi.fn(async () => "saved")
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: { status: "authorized", scope: "apply_change", approvedBy: "admin:owner" },
      diffAssessment: assessment(change),
      write,
    })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    {
      unverifiableWordingEvidence: [{
        source: "prompts/result_review.md",
        section: "Validation",
        phrase: "Check it well.",
        missingCriterion: "No pass condition.",
      }],
    },
    {
      missingExecutionCriterionEvidence: [{
        source: "prompts/workflow.md",
        section: "Step Contract",
        criterion: "completion_criterion",
      }],
    },
    {
      repeatedRuleEvidence: [{
        canonicalRuleKey: "identity.self_name",
        canonicalOwner: "prompts/identity.md",
        duplicateSource: "prompts/final_response.md",
        duplicateSection: "Identity",
      }],
    },
  ] as const)("does not write a typed clarity violation %#", async (change) => {
    const write = vi.fn(async () => "saved")
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: { status: "authorized", scope: "apply_change", approvedBy: "admin:owner" },
      diffAssessment: assessment(change),
      write,
    })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    {
      overloadedRuleSentenceEvidence: [{
        source: "prompts/tool_policy.md",
        section: "Rules",
        sentence: "Authorize, execute, and activate.",
        combinedRuleKeys: ["tool.authorization", "prompt.activation"],
      }],
    },
    {
      nonEnglishSystemInstructionEvidence: [{
        source: "prompts/system.md",
        section: "Rules",
        instruction: "요청을 처리한다.",
        detectedLanguage: "ko",
      }],
    },
    {
      userLanguageRuleWeakeningEvidence: [{
        canonicalRuleKey: "final_response.user_question_language_only",
        changedSource: "prompts/final_response.md",
        weakeningSummary: "Allows a different response language.",
      }],
    },
  ] as const)("does not write a typed language or rule-separation violation %#", async (change) => {
    const write = vi.fn(async () => "saved")
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: { status: "authorized", scope: "apply_change", approvedBy: "admin:owner" },
      diffAssessment: assessment(change),
      write,
    })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    {
      promptSourceConflictEvidence: [{
        changedSource: "prompts/final_response.md",
        changedRuleKey: "identity.self_name.override",
        canonicalSource: "prompts/identity.md",
        canonicalRuleKey: "identity.self_name",
      }],
    },
    {
      assemblyDuplicateDefinitionEvidence: [{
        definitionKey: "identity.self_name",
        contributingSources: ["prompts/identity.md", "prompts/final_response.md"],
      }],
    },
    {
      defaultAgentNameChangeEvidence: [{
        beforeName: "Knowbee",
        afterName: "Helper",
        affectedLocale: "en",
        requiredTestIds: ["assistant-name-default-en"],
        updatedTestIds: [],
      }],
    },
  ] as const)("does not write a typed source or agent-name violation %#", async (change) => {
    const write = vi.fn(async () => "saved")
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: { status: "authorized", scope: "apply_change", approvedBy: "admin:owner" },
      diffAssessment: assessment(change),
      write,
    })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    {
      impliedRuntimeActivationEvidence: [{
        changedSource: "prompts/prompt_improvement.md",
        activationPath: "runtime.reload.current",
        missingConfirmation: "activation approval receipt",
      }],
    },
    {
      removedAuditRollbackProtectionEvidence: [{
        kind: "audit",
        ruleKey: "audit.required",
      }],
    },
    {
      broadRewrite: true,
      broadRewriteArchitectureNoteReceipt: {
        artifactRef: ".tasks/architecture/prompt-rewrite.md",
        smallDiffInsufficiencyRationale: "",
        reviewedBy: "reviewer:prompt-owner",
      },
    },
  ] as const)("does not write a typed activation or protection violation %#", async (change) => {
    const write = vi.fn(async () => "saved")
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: { status: "authorized", scope: "apply_change", approvedBy: "admin:owner" },
      diffAssessment: assessment(change),
      write,
    })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
  })

  it("distinguishes copied and multi-file duplicate definitions", () => {
    const result = validatePromptImprovementDiffAssessment(assessment({
      copiedRulesWithoutReferences: ["identity.self_name"],
      multiFileRuleDefinitions: ["safety.tool_authorization"],
    }))
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "diff_copied_rule_without_reference",
        path: "copiedRulesWithoutReferences",
      }),
      expect.objectContaining({
        code: "diff_multi_file_rule_definition",
        path: "multiFileRuleDefinitions",
      }),
    ]))
  })

  it.each(PROMPT_IMPROVEMENT_CRITICAL_RULE_CATEGORIES)(
    "rejects weakening critical %s rules",
    (category) => {
      const result = validatePromptImprovementDiffAssessment(assessment({
        weakensCriticalRules: [{ category, ruleKey: `${category}.required_rule` }],
      }))
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "diff_critical_rule_weakening",
        path: "weakensCriticalRules",
      }))
    },
  )

  it("keeps draft, apply, and activation approval scopes independent", () => {
    const record = (approvalScope: PromptImprovementApprovalRecord["approvalScope"]): PromptImprovementApprovalRecord => ({
      approvedBy: "admin:owner",
      approvedAt: "2026-07-14T12:00:00.000Z",
      approvalScope,
      targetPromptSources: ["prompts/final_response.md"],
      targetHarnessSources: [],
      riskAccepted: "medium",
    })
    expect(authorizePromptImprovementApprovalScope({
      approvalRecord: record(["draft"]),
      requestedScope: "apply_change",
    })).toEqual({ status: "blocked", reasonCode: "approval_scope_missing" })
    expect(authorizePromptImprovementApprovalScope({
      approvalRecord: record(["apply_change"]),
      requestedScope: "activation",
    })).toEqual({ status: "blocked", reasonCode: "approval_scope_missing" })
    expect(authorizePromptImprovementApprovalScope({
      approvalRecord: record(["activation"]),
      requestedScope: "activation",
    })).toEqual({ status: "authorized", scope: "activation", approvedBy: "admin:owner" })
  })

  it("never writes without exact apply approval and a reviewable diff", async () => {
    const write = vi.fn(async () => "saved")
    const approvalRecord: PromptImprovementApprovalRecord = {
      approvedBy: "admin:owner",
      approvedAt: "2026-07-14T12:00:00.000Z",
      approvalScope: ["apply_change"],
      targetPromptSources: ["prompts/final_response.md"],
      targetHarnessSources: [],
      riskAccepted: "medium",
    }
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: authorizePromptImprovementApprovalScope({ approvalRecord, requestedScope: "activation" }),
      diffAssessment: assessment(),
      write,
    })).resolves.toEqual({ status: "blocked", reasonCode: "approval_scope_missing" })
    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: authorizePromptImprovementApprovalScope({ approvalRecord, requestedScope: "apply_change" }),
      diffAssessment: assessment({ unrelatedSectionsRewritten: true }),
      write,
    })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()

    await expect(writeApprovedReviewablePromptDiff({
      approvalDecision: authorizePromptImprovementApprovalScope({ approvalRecord, requestedScope: "apply_change" }),
      diffAssessment: assessment(),
      write,
    })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })
})
