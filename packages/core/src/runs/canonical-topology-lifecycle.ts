import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkReceiptKind } from "../contracts/canonical-work-receipt.js"
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js"
import { REQUIRED_SOLUTION_PATHS } from "../contracts/solution-path-exhaustion.js"
import type {
  TopologyRootRunExecutionResult,
  TopologyRootRunRoutingDecision,
} from "../topology-runtime/harness.js"

type TopologyRoute = Extract<TopologyRootRunRoutingDecision, { mode: "route" }>

interface LifecycleReceipt {
  receiptId: string
  workId: string
  kind: CanonicalWorkReceiptKind
  evidenceFingerprint: `sha256:${string}`
  evidenceRefs: string[]
}

interface PersistedReceipt {
  workId: string
  kind: string
  evidenceFingerprint: string
  evidenceRefs: string[]
  consumedRevision?: number | undefined
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function receipt(input: {
  runId: string
  workId: string
  stage: string
  kind: CanonicalWorkReceiptKind
  evidence: unknown
  refs: string[]
}): LifecycleReceipt {
  const digest = hash(JSON.stringify(input.evidence))
  return {
    receiptId: `receipt:${input.stage}:${input.runId}:${digest.slice(0, 24)}`,
    workId: input.workId,
    kind: input.kind,
    evidenceFingerprint: `sha256:${digest}`,
    evidenceRefs: [...new Set(input.refs)],
  }
}

function exact(existing: PersistedReceipt | undefined, expected: LifecycleReceipt): boolean {
  return Boolean(
    existing &&
      existing.workId === expected.workId &&
      existing.kind === expected.kind &&
      existing.evidenceFingerprint === expected.evidenceFingerprint &&
      existing.evidenceRefs.length === expected.evidenceRefs.length &&
      existing.evidenceRefs.every((ref, index) => ref === expected.evidenceRefs[index]),
  )
}

function recordSequence(
  input: {
    runId: string
    workId: string
    startRevision: number
    receipts: readonly LifecycleReceipt[]
    events: readonly CanonicalWorkEvent[]
  },
  dependencies: {
    issueReceipt: (
      receipt: LifecycleReceipt,
    ) => { issued: true } | { issued: false; reasonCode: string }
    loadReceipt: (receiptId: string) => PersistedReceipt | undefined
    applyTransition: (input: {
      runId: string
      workId: string
      expectedRevision: number
      event: CanonicalWorkEvent
      receiptRef: string
    }) => { status: string; reasonCode?: string | undefined }
  },
): { ok: true } | { ok: false; reasonCode: string } {
  for (const item of input.receipts) {
    const issued = dependencies.issueReceipt(item)
    if (!issued.issued && !exact(dependencies.loadReceipt(item.receiptId), item)) {
      return { ok: false, reasonCode: issued.reasonCode }
    }
  }
  for (const [index, item] of input.receipts.entries()) {
    const consumedRevision = dependencies.loadReceipt(item.receiptId)?.consumedRevision
    const nextRevision = input.startRevision + index + 1
    if (consumedRevision !== undefined) {
      if (consumedRevision !== nextRevision) {
        return { ok: false, reasonCode: "topology_receipt_consumed_at_invalid_revision" }
      }
      continue
    }
    const event = input.events[index]
    if (!event) return { ok: false, reasonCode: "topology_event_sequence_invalid" }
    const transition = dependencies.applyTransition({
      runId: input.runId,
      workId: input.workId,
      expectedRevision: input.startRevision + index,
      event,
      receiptRef: item.receiptId,
    })
    if (transition.status !== "applied") {
      return {
        ok: false,
        reasonCode: transition.reasonCode ?? "canonical_topology_transition_rejected",
      }
    }
  }
  return { ok: true }
}

export interface CanonicalTopologyAdmissionDescriptor {
  runId: string
  workId: string
  receipts: readonly [LifecycleReceipt, LifecycleReceipt, LifecycleReceipt]
}

export function buildCanonicalTopologyAdmissionDescriptor(input: {
  runId: string
  route: TopologyRoute
  requestDiagnosisReceiptId: string
  solutionPlanReceiptId: string
  cancellationTokenId: string
  signalAborted: boolean
}):
  | { ok: true; descriptor: CanonicalTopologyAdmissionDescriptor }
  | { ok: false; reasonCode: string } {
  if (input.signalAborted) return { ok: false, reasonCode: "topology_execution_cancelled" }
  const runId = input.runId.trim()
  const requestDiagnosisReceiptId = input.requestDiagnosisReceiptId.trim()
  const solutionPlanReceiptId = input.solutionPlanReceiptId.trim()
  const cancellationTokenId = input.cancellationTokenId.trim()
  const selectedExecutorId =
    input.route.selectedExecutorId?.trim() || input.route.entryNodeId.trim()
  if (!runId || !cancellationTokenId || !input.route.topologyId.trim() || !selectedExecutorId) {
    return { ok: false, reasonCode: "topology_admission_invalid" }
  }
  if (!requestDiagnosisReceiptId || !solutionPlanReceiptId) {
    return { ok: false, reasonCode: "topology_planning_receipt_invalid" }
  }
  const workId = canonicalWorkIdForRootRun(runId)
  const routeEvidence = {
    topologyId: input.route.topologyId,
    topologyVersion: input.route.topologyVersion,
    compiledTopologySnapshotId: input.route.compiledTopologySnapshotId,
    entryNodeId: input.route.entryNodeId,
    selectedExecutorId,
    selectedConnectionPath: input.route.selectedConnectionPath ?? [],
  }
  const routeDigest = hash(JSON.stringify(routeEvidence))
  const refs = [
    `topology-snapshot:${input.route.compiledTopologySnapshotId}`,
    `topology-route:${runId}:${routeDigest.slice(0, 24)}`,
    `topology-executor:${selectedExecutorId}`,
    `request-diagnosis-receipt:${requestDiagnosisReceiptId}`,
    `solution-plan-receipt:${solutionPlanReceiptId}`,
  ]
  return {
    ok: true,
    descriptor: {
      runId,
      workId,
      receipts: [
        receipt({
          runId,
          workId,
          stage: "topology-diagnosis",
          kind: "diagnosis",
          evidence: { routeEvidence, requestDiagnosisReceiptId, solutionPlanReceiptId },
          refs,
        }),
        receipt({
          runId,
          workId,
          stage: "topology-policy",
          kind: "policy",
          evidence: { routeEvidence, allowed: true },
          refs,
        }),
        receipt({
          runId,
          workId,
          stage: "topology-execution",
          kind: "execution",
          evidence: { routeEvidence, cancellationTokenId },
          refs: [...refs, `cancellation-token:${cancellationTokenId}`],
        }),
      ],
    },
  }
}

export function recordCanonicalTopologyAdmission(
  descriptor: CanonicalTopologyAdmissionDescriptor,
  dependencies: Parameters<typeof recordSequence>[1],
): { ok: true } | { ok: false; reasonCode: string } {
  return recordSequence(
    {
      runId: descriptor.runId,
      workId: descriptor.workId,
      startRevision: 0,
      receipts: descriptor.receipts,
      events: ["DIAGNOSIS_ACCEPTED", "POLICY_ALLOWED", "EXECUTION_STARTED"],
    },
    dependencies,
  )
}

export interface CanonicalTopologyResultDescriptor {
  runId: string
  workId: string
  attemptReceipt: LifecycleReceipt
  verificationReceipt?: LifecycleReceipt | undefined
  verificationEvent?: "ALL_CRITERIA_VERIFIED" | "SOME_CRITERIA_VERIFIED" | undefined
  terminalReceipt?: LifecycleReceipt | undefined
  terminalEvent?: "POLICY_BLOCKED" | "PATHS_EXHAUSTED" | undefined
  finalOutcome?: "blocked" | "exhausted" | undefined
}

export function buildCanonicalTopologyResultDescriptor(input: {
  runId: string
  result: TopologyRootRunExecutionResult
  resultDiagnosisReceiptId?: string | undefined
}):
  | { ok: true; descriptor: CanonicalTopologyResultDescriptor }
  | { ok: false; reasonCode: string } {
  const runId = input.runId.trim()
  if (!runId) return { ok: false, reasonCode: "topology_result_invalid" }
  const resultDiagnosisReceiptId = input.resultDiagnosisReceiptId?.trim() ?? ""
  if (input.result.ok && !resultDiagnosisReceiptId) {
    return { ok: false, reasonCode: "topology_result_diagnosis_receipt_invalid" }
  }
  const workId = canonicalWorkIdForRootRun(runId)
  const resultReport = input.result.runtimeResult?.nodeResultReport
  const evidence = input.result.ok
    ? {
        ok: true,
        topologyRunId: input.result.topologyRunId,
        resultReportId: input.result.nodeResultReport.resultReportId,
        status: input.result.nodeResultReport.status,
      }
    : {
        ok: false,
        reasonCode: input.result.reasonCode,
        status: resultReport?.status ?? null,
      }
  const evidenceDigest = hash(JSON.stringify(evidence))
  const refs = [
    `topology-attempt:${runId}:${evidenceDigest.slice(0, 24)}`,
    ...(resultDiagnosisReceiptId ? [`result-diagnosis-receipt:${resultDiagnosisReceiptId}`] : []),
    ...(input.result.ok
      ? [
          `topology-run:${input.result.topologyRunId}`,
          `node-result:${input.result.nodeResultReport.resultReportId}`,
        ]
      : []),
  ]
  const attemptReceipt = receipt({
    runId,
    workId,
    stage: "topology-attempt",
    kind: "attempt",
    evidence,
    refs,
  })
  if (!input.result.ok) {
    const terminalStopDecision = input.result.runtimeResult?.terminalStopDecision
    if (!terminalStopDecision) {
      return { ok: true, descriptor: { runId, workId, attemptReceipt } }
    }
    const terminal = terminalStopDecision.reportInput
    if (!resultDiagnosisReceiptId || terminal.diagnosisReceiptId !== resultDiagnosisReceiptId) {
      return { ok: false, reasonCode: "topology_terminal_diagnosis_receipt_invalid" }
    }
    if (terminal.evidenceRefs.length === 0 || terminal.unresolvedItemIds.length === 0) {
      return { ok: false, reasonCode: "topology_terminal_evidence_invalid" }
    }
    if (
      REQUIRED_SOLUTION_PATHS.some(
        (path) =>
          !terminal.evidenceRefs.some((ref) =>
            ref.startsWith(`solution-path-review:${path}:`),
          ),
      )
    ) {
      return { ok: false, reasonCode: "topology_terminal_paths_incomplete" }
    }
    if (
      terminal.reasonCode === "solution_paths_exhausted" &&
      !terminal.evidenceRefs.some((ref) => ref.startsWith("attempt-strategy:"))
    ) {
      return { ok: false, reasonCode: "topology_terminal_attempt_evidence_missing" }
    }
    const policyBlocked = terminal.reasonCode === "permission_denied"
    const terminalEvent = policyBlocked ? ("POLICY_BLOCKED" as const) : ("PATHS_EXHAUSTED" as const)
    const finalOutcome = policyBlocked ? ("blocked" as const) : ("exhausted" as const)
    return {
      ok: true,
      descriptor: {
        runId,
        workId,
        attemptReceipt,
        terminalReceipt: receipt({
          runId,
          workId,
          stage: policyBlocked ? "topology-policy-block" : "topology-path-exhaustion",
          kind: policyBlocked ? "policy" : "exhaustion",
          evidence: {
            diagnosisReceiptId: terminal.diagnosisReceiptId,
            reasonCode: terminal.reasonCode,
            unresolvedItemIds: [...terminal.unresolvedItemIds].sort(),
            evidenceFingerprint: `sha256:${hash(JSON.stringify(terminal.evidenceRefs))}`,
          },
          refs: [
            `result-diagnosis-receipt:${terminal.diagnosisReceiptId}`,
            ...terminal.evidenceRefs,
          ],
        }),
        terminalEvent,
        finalOutcome,
      },
    }
  }

  const report = input.result.nodeResultReport
  const satisfiedOutputIds = report.outputs
    .filter((output) => output.status === "satisfied")
    .map((output) => output.outputId)
    .sort()
  const partialOutputIds = report.outputs
    .filter((output) => output.status === "partial")
    .map((output) => output.outputId)
    .sort()
  const verificationEvent =
    report.status === "completed" &&
    report.unmetSuccessCriteriaIds.length === 0 &&
    report.outputs.length > 0 &&
    report.outputs.every((output) => output.status === "satisfied")
      ? ("ALL_CRITERIA_VERIFIED" as const)
      : satisfiedOutputIds.length > 0 || partialOutputIds.length > 0
        ? ("SOME_CRITERIA_VERIFIED" as const)
        : undefined
  if (!verificationEvent)
    return { ok: false, reasonCode: "topology_result_has_no_verified_evidence" }
  const verificationEvidence = {
    resultDiagnosisReceiptId,
    status: report.status,
    satisfiedOutputIds,
    partialOutputIds,
    unmetSuccessCriteriaIds: [...report.unmetSuccessCriteriaIds].sort(),
    risksOrGapsFingerprint: `sha256:${hash(JSON.stringify(report.risksOrGaps))}`,
  }
  return {
    ok: true,
    descriptor: {
      runId,
      workId,
      attemptReceipt,
      verificationReceipt: receipt({
        runId,
        workId,
        stage: "topology-verification",
        kind: "verification",
        evidence: verificationEvidence,
        refs: [
          ...refs,
          ...satisfiedOutputIds.map((outputId) => `verified-output:${outputId}`),
          ...partialOutputIds.map((outputId) => `partial-output:${outputId}`),
        ],
      }),
      verificationEvent,
    },
  }
}

export function recordCanonicalTopologyResult(
  descriptor: CanonicalTopologyResultDescriptor,
  dependencies: Parameters<typeof recordSequence>[1],
): { ok: true } | { ok: false; reasonCode: string } {
  const receipts = descriptor.verificationReceipt
    ? [descriptor.attemptReceipt, descriptor.verificationReceipt]
    : descriptor.terminalReceipt
      ? [descriptor.attemptReceipt, descriptor.terminalReceipt]
      : [descriptor.attemptReceipt]
  const events: CanonicalWorkEvent[] = descriptor.verificationEvent
    ? ["ATTEMPT_RECORDED", descriptor.verificationEvent]
    : descriptor.terminalEvent
      ? ["ATTEMPT_RECORDED", descriptor.terminalEvent]
      : ["ATTEMPT_RECORDED"]
  return recordSequence(
    {
      runId: descriptor.runId,
      workId: descriptor.workId,
      startRevision: 3,
      receipts,
      events,
    },
    dependencies,
  )
}
