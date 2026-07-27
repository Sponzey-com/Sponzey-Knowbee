import type {
  CapabilitySelectionDecisionTraceSink,
  CapabilitySelectionTraceReasonCode,
  CapabilitySelectionTraceValidationCode,
} from "../contracts/capability-selection-decision-trace.js"
import {
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
  projectLlmCapabilitySelectionProviderInput,
  validateLlmCapabilitySelectionDecision,
  type CapabilitySelectionSnapshot,
  type LlmCapabilitySelectionAdmission,
  type LlmCapabilitySelectionAttemptProvider,
  type LlmCapabilitySelectionAttemptResult,
  type LlmCapabilitySelectionContext,
  type LlmCapabilitySelectionSchemaRepairProvider,
  type LlmCapabilitySelectionValidationCode,
} from "../contracts/llm-capability-selection.js"

type CapabilitySelectionUseCaseTerminalResult =
  | LlmCapabilitySelectionAdmission
  | {
      status: "failed"
      reasonCode:
        | "capability_selection_context_invalid"
        | "capability_selection_provider_failed"
        | "capability_selection_timed_out"
        | "capability_selection_output_limit_exceeded"
        | "capability_selection_invalid_output"
        | "capability_selection_trace_failed"
      validationReasonCodes?: Array<
        LlmCapabilitySelectionValidationCode | "invalid_json" | "json_object_required"
      >
      attemptCount: 0 | 1 | 2
    }
  | {
      status: "cancelled"
      reasonCode: "capability_selection_cancelled"
      attemptCount: 1 | 2
    }

export type CapabilitySelectionUseCaseResult = CapabilitySelectionUseCaseTerminalResult & {
  decisionTraceId?: string
  strategyFingerprints?: string[]
}

function validSelectionContext(context: LlmCapabilitySelectionContext): boolean {
  return Boolean(
    context.goal.trim() &&
      context.completionCriteria.length > 0 &&
      context.completionCriteria.every((item) => item.trim()) &&
      context.constraints.every((item) => item.trim()) &&
      context.failedStrategyFingerprints.every((item) => item.trim()),
  )
}

export async function executeCapabilitySelection(input: {
  runId: string
  receiptId: string
  capabilitySnapshot: CapabilitySelectionSnapshot
  selectionContext: LlmCapabilitySelectionContext
  provider: LlmCapabilitySelectionAttemptProvider
  repairProvider?: LlmCapabilitySelectionSchemaRepairProvider
  traceSink?: CapabilitySelectionDecisionTraceSink
  userMethodSpecified: boolean
  externalTransferAllowed: boolean
  maxCost: "none" | "low" | "high"
}): Promise<CapabilitySelectionUseCaseResult> {
  if (!validSelectionContext(input.selectionContext)) {
    return finalizeWithTrace(input, {
      status: "failed",
      reasonCode: "capability_selection_context_invalid",
      attemptCount: 0,
    }, traceEvidence(0))
  }

  let providerInput
  try {
    providerInput = projectLlmCapabilitySelectionProviderInput({
      runId: input.runId,
      capabilitySnapshot: input.capabilitySnapshot,
      selectionContext: input.selectionContext,
    })
  } catch {
    return finalizeWithTrace(input, {
      status: "failed",
      reasonCode: "capability_selection_provider_failed",
      attemptCount: 0,
    }, traceEvidence(0))
  }

  const initial = await safeAttempt(() => input.provider.attemptCapabilitySelection(providerInput))
  const initialTerminal = terminalAttemptResult(initial, 1)
  if (initialTerminal) {
    return finalizeWithTrace(input, initialTerminal, traceEvidence(1))
  }

  const initialValidation =
    initial.status === "completed"
      ? validateLlmCapabilitySelectionDecision(initial.output)
      : {
          valid: false as const,
          reasonCodes: [initial.reasonCode] as Array<"invalid_json" | "json_object_required">,
        }

  let selected = initial
  let validation = initialValidation
  let attemptCount: 1 | 2 = 1
  const observedValidationCodes: CapabilitySelectionTraceValidationCode[] =
    initialValidation.valid === false ? [...initialValidation.reasonCodes] : []
  if (validation.valid === false) {
    if (!input.repairProvider) {
      return finalizeWithTrace(
        input,
        invalidOutputResult(validation.reasonCodes, attemptCount),
        traceEvidence(attemptCount, observedValidationCodes),
      )
    }
    const validationReasonCodes = validation.reasonCodes
    const repaired = await safeAttempt(() =>
      input.repairProvider!.repairCapabilitySelection({
        subject: providerInput,
        ...(selected.status === "completed" ? { invalidOutput: selected.output } : {}),
        validationReasonCodes,
        repairAttemptNumber: 1,
      }),
    )
    attemptCount = 2
    const repairTerminal = terminalAttemptResult(repaired, attemptCount)
    if (repairTerminal) {
      return finalizeWithTrace(
        input,
        repairTerminal,
        traceEvidence(attemptCount, observedValidationCodes),
      )
    }
    selected = repaired
    validation =
      repaired.status === "completed"
        ? validateLlmCapabilitySelectionDecision(repaired.output)
        : {
            valid: false,
            reasonCodes: [repaired.reasonCode] as Array<"invalid_json" | "json_object_required">,
          }
    if (validation.valid === false) {
      observedValidationCodes.push(...validation.reasonCodes)
    }
  }

  if (validation.valid === false) {
    return finalizeWithTrace(
      input,
      invalidOutputResult(validation.reasonCodes, attemptCount),
      traceEvidence(attemptCount, observedValidationCodes),
    )
  }
  if (selected.status !== "completed") {
    return finalizeWithTrace(
      input,
      invalidOutputResult(["json_object_required"], attemptCount),
      traceEvidence(attemptCount, observedValidationCodes),
    )
  }
  const decision = validation.decision
  const admission = admitLlmCapabilitySelection({
    runId: input.runId,
    userMethodSpecified: input.userMethodSpecified,
    externalTransferAllowed: input.externalTransferAllowed,
    maxCost: input.maxCost,
    failedStrategyFingerprints: input.selectionContext.failedStrategyFingerprints,
    capabilitySnapshot: input.capabilitySnapshot,
    decision,
    receipt: createLlmCapabilitySelectionReceipt({
      receiptId: input.receiptId,
      decision,
    }),
  })
  const strategyFingerprints = [
    ...new Set(
      decision.bindingAssessments
        .map((assessment) => assessment.strategyFingerprint.trim())
        .filter((fingerprint) => SAFE_STRATEGY_FINGERPRINT.test(fingerprint)),
    ),
  ].sort()
  return finalizeWithTrace(
    input,
    admission,
    {
      ...traceEvidence(attemptCount, observedValidationCodes),
      admissionReasonCodes: admission.status === "rejected" ? admission.reasonCodes : [],
      strategyFingerprints,
    },
  )
}

const SAFE_STRATEGY_FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u

interface CapabilitySelectionTraceEvidence {
  attemptCount: 0 | 1 | 2
  attemptKinds: Array<"initial" | "repair">
  validationReasonCodes: CapabilitySelectionTraceValidationCode[]
  admissionReasonCodes: import("../contracts/llm-capability-selection.js").LlmCapabilitySelectionRejectionCode[]
  strategyFingerprints: string[]
}

function traceEvidence(
  attemptCount: 0 | 1 | 2,
  validationReasonCodes: CapabilitySelectionTraceValidationCode[] = [],
): CapabilitySelectionTraceEvidence {
  return {
    attemptCount,
    attemptKinds:
      attemptCount === 0 ? [] : attemptCount === 1 ? ["initial"] : ["initial", "repair"],
    validationReasonCodes: [...new Set(validationReasonCodes)],
    admissionReasonCodes: [],
    strategyFingerprints: [],
  }
}

function finalizeWithTrace(
  input: {
    runId: string
    receiptId: string
    traceSink?: CapabilitySelectionDecisionTraceSink
  },
  result: CapabilitySelectionUseCaseResult,
  evidence: CapabilitySelectionTraceEvidence,
): CapabilitySelectionUseCaseResult {
  const resultWithRecoveryEvidence: CapabilitySelectionUseCaseResult =
    result.status === "rejected" && evidence.strategyFingerprints.length > 0
      ? {
          ...result,
          strategyFingerprints: [...evidence.strategyFingerprints],
        }
      : result
  if (!input.traceSink) return resultWithRecoveryEvidence
  const failureReasonCode = "reasonCode" in result ? result.reasonCode : undefined
  if (failureReasonCode === "capability_selection_trace_failed") {
    return resultWithRecoveryEvidence
  }
  const terminalStatus =
    result.status === "allowed" ||
    result.status === "approval_required" ||
    result.status === "rejected" ||
    result.status === "failed" ||
    result.status === "cancelled"
      ? result.status
      : "failed"
  const reasonCode: CapabilitySelectionTraceReasonCode =
    result.status === "allowed"
      ? "capability_selection_allowed"
      : result.status === "approval_required"
        ? "capability_selection_approval_required"
        : result.status === "rejected"
          ? "capability_selection_rejected"
          : failureReasonCode
            ? failureReasonCode
            : "capability_selection_provider_failed"
  const stored = input.traceSink.record({
    runId: input.runId,
    decisionReceiptId: input.receiptId,
    reasonCode,
    detail: {
      terminalStatus,
      ...evidence,
    },
  })
  return stored.status === "stored"
    ? {
        ...resultWithRecoveryEvidence,
        decisionTraceId: stored.traceId,
      }
    : {
        status: "failed",
        reasonCode: "capability_selection_trace_failed",
        attemptCount: evidence.attemptCount,
      }
}

async function safeAttempt(
  attempt: () =>
    | LlmCapabilitySelectionAttemptResult
    | Promise<LlmCapabilitySelectionAttemptResult>,
): Promise<LlmCapabilitySelectionAttemptResult> {
  try {
    return await attempt()
  } catch {
    return { status: "failed", reasonCode: "provider_failed" }
  }
}

function terminalAttemptResult(
  result: LlmCapabilitySelectionAttemptResult,
  attemptCount: 1 | 2,
): CapabilitySelectionUseCaseResult | null {
  if (result.status === "cancelled") {
    return {
      status: "cancelled",
      reasonCode: "capability_selection_cancelled",
      attemptCount,
    }
  }
  if (result.status !== "failed") return null
  const reasonCode = {
    provider_failed: "capability_selection_provider_failed",
    timed_out: "capability_selection_timed_out",
    output_limit_exceeded: "capability_selection_output_limit_exceeded",
  }[result.reasonCode] as
    | "capability_selection_provider_failed"
    | "capability_selection_timed_out"
    | "capability_selection_output_limit_exceeded"
  return { status: "failed", reasonCode, attemptCount }
}

function invalidOutputResult(
  validationReasonCodes: Array<
    LlmCapabilitySelectionValidationCode | "invalid_json" | "json_object_required"
  >,
  attemptCount: 1 | 2,
): CapabilitySelectionUseCaseResult {
  return {
    status: "failed",
    reasonCode: "capability_selection_invalid_output",
    validationReasonCodes,
    attemptCount,
  }
}
