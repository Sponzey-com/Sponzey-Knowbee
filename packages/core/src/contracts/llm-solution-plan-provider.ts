import {
  type LlmSolutionPlanPayload,
  type LlmSolutionPlanReceipt,
  createLlmSolutionPlanReceipt,
} from "./llm-solution-plan-receipt.js"

export interface LlmSolutionPlanProviderInput {
  workId: string
  runId: string
  ownerAgentName: string
  requestDiagnosisReceiptId: string
  goal: string
  constraints: string[]
  capabilityRefs: string[]
  capabilityOptions?: LlmSolutionPlanCapabilityOption[]
  requiredCapabilityRefs: string[]
  completionCriteria: string[]
}

export interface LlmSolutionPlanCapabilityOption {
  capabilityRef: string
  description: string
  risk: "safe" | "approval_required"
  effectClass:
    | "read_only"
    | "local_write"
    | "external_write"
    | "destructive"
    | "financial"
}

export interface LlmSolutionPlanProvider {
  planSolution(input: LlmSolutionPlanProviderInput): Promise<unknown> | unknown
}

export interface LlmSolutionPlanValidationIssue {
  code: "solution_plan_schema_invalid"
  path: "$"
  message: string
}

export interface LlmSolutionPlanRepairProviderInput {
  subject: LlmSolutionPlanProviderInput
  invalidRawOutput: unknown
  validationIssues: LlmSolutionPlanValidationIssue[]
  failedInputRefs: ["llm-output:solution_plan"]
  failedStrategy: "initial_llm_solution_plan"
  repairAttemptNumber: 1
}

export interface LlmSolutionPlanRepairProvider {
  repairSolutionPlan(input: LlmSolutionPlanRepairProviderInput): Promise<unknown> | unknown
}

export interface SolutionPlanCapabilitySelection {
  stepId: string
  capabilityRef: string
}

export type LlmSolutionPlanProviderResult =
  | {
      status: "valid"
      workId: string
      runId: string
      plan: LlmSolutionPlanPayload
      receipt: LlmSolutionPlanReceipt
      capabilitySelections: SolutionPlanCapabilitySelection[]
    }
  | {
      status: "blocked"
      reasonCode:
        | "invalid_solution_plan_output"
        | "invalid_solution_plan_receipt"
        | "solution_plan_capability_ref_missing"
        | "solution_plan_capability_ref_ambiguous"
        | "solution_plan_capability_ref_outside_snapshot"
        | "solution_plan_required_capability_ref_missing"
      workId: string
      runId: string
    }

export type LlmSolutionPlanProviderWithRepairResult =
  | (Extract<LlmSolutionPlanProviderResult, { status: "valid" }> & {
      repairAttempted: boolean
    })
  | {
      status: "blocked"
      reasonCode:
        | "invalid_solution_plan_output"
        | "invalid_solution_plan_receipt"
        | CapabilityRefValidationReason
        | "solution_plan_repair_provider_missing"
        | "invalid_solution_plan_after_schema_repair"
      workId: string
      runId: string
      repairAttempted: boolean
      repairFailureReasonCode?: Extract<
        LlmSolutionPlanProviderResult,
        { status: "blocked" }
      >["reasonCode"]
      reanalysis?: {
        action: "changed_strategy_reanalysis"
        failedInputRefs: ["llm-output:solution_plan", "llm-output:repaired_solution_plan"]
        failedStrategies: ["initial_llm_solution_plan", "schema_repair"]
      }
    }

const SOLUTION_PLAN_VALIDATION_ISSUES: LlmSolutionPlanValidationIssue[] = [
  {
    code: "solution_plan_schema_invalid",
    path: "$",
    message: "Solution plan must match the scoped solution-plan schema.",
  },
]

function solutionPlanValidationIssues(
  reasonCode: Extract<
    LlmSolutionPlanProviderResult,
    { status: "blocked" }
  >["reasonCode"],
): LlmSolutionPlanValidationIssue[] {
  const capabilityMessage =
    reasonCode === "solution_plan_capability_ref_missing"
      ? "Every use_tool or use_yeonjang step must include exactly one provided capability reference."
      : reasonCode === "solution_plan_capability_ref_ambiguous"
        ? "Every use_tool or use_yeonjang step must include only one provided capability reference."
        : reasonCode === "solution_plan_capability_ref_outside_snapshot"
          ? "Every capability reference must be copied exactly from the provided capability references."
          : reasonCode === "solution_plan_required_capability_ref_missing"
            ? "Every required capability reference selected by prior LLM diagnosis must be used by at least one use_tool or use_yeonjang step."
          : undefined
  return capabilityMessage
    ? [
        {
          code: "solution_plan_schema_invalid",
          path: "$",
          message: capabilityMessage,
        },
      ]
    : structuredClone(SOLUTION_PLAN_VALIDATION_ISSUES)
}

function text(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function textList(values: string[], field: string, allowEmpty = true): string[] {
  if (!allowEmpty && values.length === 0) throw new Error(`${field} require at least one value.`)
  const normalized = values.map((value) => text(value, field))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} must be unique.`)
  return normalized
}

function providerPlan(value: unknown, ownerAgentName: string): LlmSolutionPlanPayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const candidate = value as Partial<LlmSolutionPlanPayload>
  if (
    candidate.ownerAgentName !== ownerAgentName ||
    !Array.isArray(candidate.steps) ||
    candidate.steps.length === 0
  )
    return undefined
  return { ownerAgentName, steps: structuredClone(candidate.steps) }
}

type CapabilityRefValidationReason =
  | "solution_plan_capability_ref_missing"
  | "solution_plan_capability_ref_ambiguous"
  | "solution_plan_capability_ref_outside_snapshot"
  | "solution_plan_required_capability_ref_missing"

function validateActionCapabilityRefs(
  plan: LlmSolutionPlanPayload,
  capabilityRefs: string[],
  requiredCapabilityRefs: string[],
):
  | { ok: true; selections: SolutionPlanCapabilitySelection[] }
  | { ok: false; reasonCode: CapabilityRefValidationReason } {
  const snapshotRefs = new Set(capabilityRefs)
  const selections: SolutionPlanCapabilitySelection[] = []
  for (const step of plan.steps) {
    if (step.action_type !== "use_tool" && step.action_type !== "use_yeonjang") continue
    const selectedRefs = [
      ...new Set(
        step.input_refs.map((reference) => reference.trim()).filter((reference) =>
          reference.startsWith("capability:"),
        ),
      ),
    ]
    if (selectedRefs.length === 0) {
      return { ok: false, reasonCode: "solution_plan_capability_ref_missing" }
    }
    if (selectedRefs.length > 1) {
      return { ok: false, reasonCode: "solution_plan_capability_ref_ambiguous" }
    }
    const selectedRef = selectedRefs[0]
    if (!selectedRef || !snapshotRefs.has(selectedRef)) {
      return { ok: false, reasonCode: "solution_plan_capability_ref_outside_snapshot" }
    }
    selections.push({ stepId: step.step_id.trim(), capabilityRef: selectedRef })
  }
  const selectedRefSet = new Set(
    selections.map((selection) => selection.capabilityRef),
  )
  if (requiredCapabilityRefs.some((reference) => !selectedRefSet.has(reference))) {
    return {
      ok: false,
      reasonCode: "solution_plan_required_capability_ref_missing",
    }
  }
  return { ok: true, selections }
}

function normalizeProviderInput(input: {
  workId: string
  runId: string
  ownerAgentName: string
  requestDiagnosisReceiptId: string
  goal: string
  constraints: string[]
  capabilityRefs: string[]
  capabilityOptions?: LlmSolutionPlanCapabilityOption[]
  requiredCapabilityRefs?: string[]
  completionCriteria: string[]
}): LlmSolutionPlanProviderInput {
  const capabilityRefs = textList(
    input.capabilityRefs,
    "Capability references",
  ).map((reference) =>
    reference.startsWith("capability:") ? reference : `capability:${reference}`,
  )
  const requiredCapabilityRefs = textList(
    input.requiredCapabilityRefs ?? [],
    "Required capability references",
  ).map((reference) =>
    reference.startsWith("capability:") ? reference : `capability:${reference}`,
  )
  const capabilityRefSet = new Set(capabilityRefs)
  if (requiredCapabilityRefs.some((reference) => !capabilityRefSet.has(reference))) {
    throw new Error(
      "Required capability references must be present in capability references.",
    )
  }
  const capabilityOptions = input.capabilityOptions?.map((option) => {
    const capabilityRef = text(option.capabilityRef, "Capability option reference")
    const normalizedRef = capabilityRef.startsWith("capability:")
      ? capabilityRef
      : `capability:${capabilityRef}`
    if (!capabilityRefSet.has(normalizedRef)) {
      throw new Error("Capability option references must be present in capability references.")
    }
    if (
      option.risk !== "safe" &&
      option.risk !== "approval_required"
    ) {
      throw new Error("Capability option risk is invalid.")
    }
    if (
      option.effectClass !== "read_only" &&
      option.effectClass !== "local_write" &&
      option.effectClass !== "external_write" &&
      option.effectClass !== "destructive" &&
      option.effectClass !== "financial"
    ) {
      throw new Error("Capability option effect class is invalid.")
    }
    return {
      capabilityRef: normalizedRef,
      description: text(option.description, "Capability option description"),
      risk: option.risk,
      effectClass: option.effectClass,
    }
  })
  if (
    capabilityOptions &&
    new Set(capabilityOptions.map((option) => option.capabilityRef)).size !==
      capabilityOptions.length
  ) {
    throw new Error("Capability option references must be unique.")
  }
  return {
    workId: text(input.workId, "Work ID"),
    runId: text(input.runId, "Run ID"),
    ownerAgentName: text(input.ownerAgentName, "Owner agent name"),
    requestDiagnosisReceiptId: text(
      input.requestDiagnosisReceiptId,
      "Request diagnosis receipt ID",
    ),
    goal: text(input.goal, "Goal"),
    constraints: textList(input.constraints, "Constraints"),
    capabilityRefs,
    ...(capabilityOptions ? { capabilityOptions } : {}),
    requiredCapabilityRefs,
    completionCriteria: textList(input.completionCriteria, "Completion criteria", false),
  }
}

function resolvePlanOutput(input: {
  providerInput: LlmSolutionPlanProviderInput
  raw: unknown
  requestDiagnosisIssuedAt: number
  issuedAt: number
}): LlmSolutionPlanProviderResult {
  const plan = providerPlan(input.raw, input.providerInput.ownerAgentName)
  if (!plan) {
    return {
      status: "blocked",
      reasonCode: "invalid_solution_plan_output",
      workId: input.providerInput.workId,
      runId: input.providerInput.runId,
    }
  }
  const capabilityRefs = validateActionCapabilityRefs(
    plan,
    input.providerInput.capabilityRefs,
    input.providerInput.requiredCapabilityRefs,
  )
  if (!capabilityRefs.ok) {
    return {
      status: "blocked",
      reasonCode: capabilityRefs.reasonCode,
      workId: input.providerInput.workId,
      runId: input.providerInput.runId,
    }
  }
  try {
    const receipt = createLlmSolutionPlanReceipt({
      receiptId: `receipt:solution-plan:${input.providerInput.runId}:${input.issuedAt}`,
      workId: input.providerInput.workId,
      runId: input.providerInput.runId,
      requestDiagnosisReceiptId: input.providerInput.requestDiagnosisReceiptId,
      requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
      issuedAt: input.issuedAt,
      plan,
    })
    return {
      status: "valid",
      workId: input.providerInput.workId,
      runId: input.providerInput.runId,
      plan,
      receipt,
      capabilitySelections: capabilityRefs.selections,
    }
  } catch {
    return {
      status: "blocked",
      reasonCode: "invalid_solution_plan_receipt",
      workId: input.providerInput.workId,
      runId: input.providerInput.runId,
    }
  }
}

export async function runLlmSolutionPlanProvider(input: {
  provider: LlmSolutionPlanProvider
  workId: string
  runId: string
  ownerAgentName: string
  requestDiagnosisReceiptId: string
  requestDiagnosisIssuedAt: number
  issuedAt: number
  goal: string
  constraints: string[]
  capabilityRefs: string[]
  requiredCapabilityRefs?: string[]
  completionCriteria: string[]
}): Promise<LlmSolutionPlanProviderResult> {
  const providerInput = normalizeProviderInput(input)
  const raw = await input.provider.planSolution(providerInput)
  return resolvePlanOutput({
    providerInput,
    raw,
    requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
    issuedAt: input.issuedAt,
  })
}

export async function runLlmSolutionPlanProviderWithRepair(
  input: Parameters<typeof runLlmSolutionPlanProvider>[0] & {
    repairProvider?: LlmSolutionPlanRepairProvider
  },
): Promise<LlmSolutionPlanProviderWithRepairResult> {
  const providerInput = normalizeProviderInput(input)
  const raw = await input.provider.planSolution(providerInput)
  const initial = resolvePlanOutput({
    providerInput,
    raw,
    requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
    issuedAt: input.issuedAt,
  })
  if (initial.status === "valid") return { ...initial, repairAttempted: false }
  if (initial.reasonCode === "invalid_solution_plan_receipt") {
    return { ...initial, repairAttempted: false }
  }

  if (!input.repairProvider) {
    return {
      status: "blocked",
      reasonCode: "solution_plan_repair_provider_missing",
      workId: providerInput.workId,
      runId: providerInput.runId,
      repairAttempted: false,
      reanalysis: {
        action: "changed_strategy_reanalysis",
        failedInputRefs: ["llm-output:solution_plan", "llm-output:repaired_solution_plan"],
        failedStrategies: ["initial_llm_solution_plan", "schema_repair"],
      },
    }
  }

  const repairedRaw = await input.repairProvider.repairSolutionPlan({
    subject: providerInput,
    invalidRawOutput: raw,
    validationIssues: solutionPlanValidationIssues(initial.reasonCode),
    failedInputRefs: ["llm-output:solution_plan"],
    failedStrategy: "initial_llm_solution_plan",
    repairAttemptNumber: 1,
  })
  const repaired = resolvePlanOutput({
    providerInput,
    raw: repairedRaw,
    requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
    issuedAt: input.issuedAt,
  })
  if (repaired.status === "valid") return { ...repaired, repairAttempted: true }
  return {
    status: "blocked",
    reasonCode: "invalid_solution_plan_after_schema_repair",
    workId: providerInput.workId,
    runId: providerInput.runId,
    repairAttempted: true,
    repairFailureReasonCode: repaired.reasonCode,
    reanalysis: {
      action: "changed_strategy_reanalysis",
      failedInputRefs: ["llm-output:solution_plan", "llm-output:repaired_solution_plan"],
      failedStrategies: ["initial_llm_solution_plan", "schema_repair"],
    },
  }
}
