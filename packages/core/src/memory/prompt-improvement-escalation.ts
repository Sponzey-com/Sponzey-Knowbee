export const PROMPT_IMPROVEMENT_ESCALATION_STAGES = [
  "prompt_investigation",
  "code_change_proposal",
  "implementation",
  "test_plan",
] as const

export type PromptImprovementEscalationStage = typeof PROMPT_IMPROVEMENT_ESCALATION_STAGES[number]

export interface PromptImprovementEscalationTask {
  stage: PromptImprovementEscalationStage
  ownerAgentName: string
  inputs: string[]
  expectedOutputs: string[]
  dependsOn: PromptImprovementEscalationStage[]
  completionCriteria: string[]
}

export interface PromptImprovementEscalationPackage {
  problem: string
  reason: string
  evidence: string[]
  tasks: PromptImprovementEscalationTask[]
}

interface EscalationArtifactBase {
  workPackageId: string
  ownerAgentName: string
  artifactFingerprint: string
  predecessorFingerprint: string | null
}

export interface PromptInvestigationArtifact extends EscalationArtifactBase {
  stage: "prompt_investigation"
  observedBehavior: string
  promptEvidence: string[]
  limitationReason: string
  affectedPromptSources: string[]
}

export interface CodeChangeProposalArtifact extends EscalationArtifactBase {
  stage: "code_change_proposal"
  exactCodeBoundary: string[]
  changeIntent: string
  risk: "low" | "medium" | "high"
  rollbackPlan: string
  approvalRequired: boolean
}

export interface EscalationTestPlanArtifact extends EscalationArtifactBase {
  stage: "test_plan"
  implementationScope: string[]
  originalFailure: string
  expectedBehavior: string
  regressionCommands: string[]
  rollbackVerification: string
}

export type PromptImprovementEscalationArtifact = PromptInvestigationArtifact | CodeChangeProposalArtifact | EscalationTestPlanArtifact
export type PromptImprovementEscalationArtifactDecision =
  | { status: "ready"; artifact: PromptImprovementEscalationArtifact }
  | { status: "blocked"; reasonCode: "artifact_required_field_missing" | "artifact_scope_invalid" | "artifact_lineage_mismatch" | "artifact_stage_invalid" }

export type PromptImprovementCapabilityDecision =
  | { status: "prompt_only_ready"; promptSourceRefs: string[] }
  | { status: "escalation_required"; workPackage: PromptImprovementEscalationPackage }
  | { status: "blocked"; reasonCode: "disguised_code_or_config_change" | "assessment_invalid" }

const EXACT_PROMPT_SOURCE = /^(?:prompts\/[a-z0-9_-]+(?:\.(?:ko|en))?\.md|[a-z0-9_]+:(?:ko|en)|prompt-metadata:[a-z0-9_.-]+)$/iu
const DISGUISED_CHANGE = /^(?:packages\/|apps\/|scripts\/|config:|configuration:|env:|environment:|\.env(?:\.|$)|runtime:)/iu

function nonEmpty(value: string): string {
  return value.trim()
}

function task(
  stage: PromptImprovementEscalationStage,
  ownerAgentName: string,
  inputs: string[],
  expectedOutputs: string[],
  dependsOn: PromptImprovementEscalationStage[],
  completionCriteria: string[],
): PromptImprovementEscalationTask {
  return { stage, ownerAgentName, inputs, expectedOutputs, dependsOn, completionCriteria }
}

export function decidePromptImprovementCapability(input: {
  problem: string
  ownerAgentName: string
  canSolveWithPromptOnly: boolean
  assessmentReason: string
  assessmentEvidence: string[]
  requestedTargetRefs: string[]
}): PromptImprovementCapabilityDecision {
  const problem = nonEmpty(input.problem)
  const ownerAgentName = nonEmpty(input.ownerAgentName)
  const reason = nonEmpty(input.assessmentReason)
  const evidence = input.assessmentEvidence.map(nonEmpty).filter(Boolean)
  const targets = input.requestedTargetRefs.map(nonEmpty).filter(Boolean)
  if (!problem || !ownerAgentName || !reason || evidence.length === 0) {
    return { status: "blocked", reasonCode: "assessment_invalid" }
  }
  if (targets.some((target) => DISGUISED_CHANGE.test(target) || !EXACT_PROMPT_SOURCE.test(target))) {
    return { status: "blocked", reasonCode: "disguised_code_or_config_change" }
  }
  if (input.canSolveWithPromptOnly) {
    if (targets.length === 0) return { status: "blocked", reasonCode: "assessment_invalid" }
    return { status: "prompt_only_ready", promptSourceRefs: [...new Set(targets)] }
  }
  return {
    status: "escalation_required",
    workPackage: {
      problem,
      reason,
      evidence,
      tasks: [
        task("prompt_investigation", ownerAgentName, ["problem", "prompt sources", "behavior evidence"], ["prompt investigation report"], [], ["Prompt-only limitation is demonstrated with exact evidence."]),
        task("code_change_proposal", ownerAgentName, ["prompt investigation report"], ["bounded code change proposal"], ["prompt_investigation"], ["Affected code boundary, risk, and rollback are identified."]),
        task("implementation", ownerAgentName, ["approved code change proposal"], ["implementation change set"], ["code_change_proposal"], ["Implementation uses the explicit code execution port and stays within approved scope."]),
        task("test_plan", ownerAgentName, ["implementation change set", "original behavior evidence"], ["executable regression test plan"], ["implementation"], ["Tests cover the original failure, changed behavior, and rollback path."]),
      ],
    },
  }
}

export async function applyPromptOnlyDecision<T>(input: {
  decision: PromptImprovementCapabilityDecision
  applyPrompt: (sourceRefs: string[]) => Promise<T>
}): Promise<{ status: "applied"; result: T } | Exclude<PromptImprovementCapabilityDecision, { status: "prompt_only_ready" }>> {
  if (input.decision.status !== "prompt_only_ready") return input.decision
  return { status: "applied", result: await input.applyPrompt(input.decision.promptSourceRefs) }
}

export async function executeApprovedImplementation<T>(input: {
  task: PromptImprovementEscalationTask
  approved: boolean
  executeImplementation: (task: PromptImprovementEscalationTask) => Promise<T>
}): Promise<{ status: "executed"; result: T } | { status: "blocked"; reasonCode: "implementation_task_required" | "implementation_approval_required" }> {
  if (input.task.stage !== "implementation") return { status: "blocked", reasonCode: "implementation_task_required" }
  if (!input.approved) return { status: "blocked", reasonCode: "implementation_approval_required" }
  return { status: "executed", result: await input.executeImplementation(input.task) }
}

function completeStrings(values: string[]): boolean {
  return values.length > 0 && values.every((value) => value.trim().length > 0) && new Set(values.map((value) => value.trim())).size === values.length
}

function sameScope(left: string[], right: string[]): boolean {
  const a = [...new Set(left.map((value) => value.trim()).filter(Boolean))].sort()
  const b = [...new Set(right.map((value) => value.trim()).filter(Boolean))].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function validatePromptImprovementEscalationArtifact(input: {
  artifact: Partial<PromptImprovementEscalationArtifact>
  expectedWorkPackageId: string
  expectedOwnerAgentName: string
  expectedPredecessorFingerprint: string | null
  approvedImplementationScope?: string[]
}): PromptImprovementEscalationArtifactDecision {
  const artifact = input.artifact
  if (!artifact.stage || !["prompt_investigation", "code_change_proposal", "test_plan"].includes(artifact.stage)) {
    return { status: "blocked", reasonCode: "artifact_stage_invalid" }
  }
  if (
    !artifact.workPackageId?.trim()
    || !artifact.ownerAgentName?.trim()
    || !artifact.artifactFingerprint?.trim()
    || artifact.workPackageId !== input.expectedWorkPackageId
    || artifact.ownerAgentName !== input.expectedOwnerAgentName
  ) return { status: "blocked", reasonCode: "artifact_required_field_missing" }
  if (artifact.predecessorFingerprint !== input.expectedPredecessorFingerprint) {
    return { status: "blocked", reasonCode: "artifact_lineage_mismatch" }
  }
  if (artifact.stage === "prompt_investigation") {
    const investigation = artifact as Partial<PromptInvestigationArtifact>
    if (!investigation.observedBehavior?.trim() || !investigation.limitationReason?.trim() || !completeStrings(investigation.promptEvidence ?? []) || !completeStrings(investigation.affectedPromptSources ?? [])) {
      return { status: "blocked", reasonCode: "artifact_required_field_missing" }
    }
  } else if (artifact.stage === "code_change_proposal") {
    const proposal = artifact as Partial<CodeChangeProposalArtifact>
    if (!completeStrings(proposal.exactCodeBoundary ?? []) || !proposal.changeIntent?.trim() || !proposal.risk || !proposal.rollbackPlan?.trim() || proposal.approvalRequired !== true) {
      return { status: "blocked", reasonCode: "artifact_required_field_missing" }
    }
  } else {
    const testPlan = artifact as Partial<EscalationTestPlanArtifact>
    if (!completeStrings(testPlan.implementationScope ?? []) || !testPlan.originalFailure?.trim() || !testPlan.expectedBehavior?.trim() || !completeStrings(testPlan.regressionCommands ?? []) || !testPlan.rollbackVerification?.trim()) {
      return { status: "blocked", reasonCode: "artifact_required_field_missing" }
    }
    if (!input.approvedImplementationScope || !sameScope(testPlan.implementationScope ?? [], input.approvedImplementationScope)) {
      return { status: "blocked", reasonCode: "artifact_scope_invalid" }
    }
  }
  return { status: "ready", artifact: artifact as PromptImprovementEscalationArtifact }
}

export async function executeValidatedEscalationArtifact<T>(input: {
  decision: PromptImprovementEscalationArtifactDecision
  execute: (artifact: PromptImprovementEscalationArtifact) => Promise<T>
}): Promise<{ status: "executed"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.decision.status !== "ready") return input.decision
  return { status: "executed", result: await input.execute(input.decision.artifact) }
}
