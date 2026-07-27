import { describe, expect, it, vi } from "vitest"
import {
  VerifyConversationProcessUseCase,
  type ConversationControlProbePort,
  type ConversationDeliveryPostCheckPort,
  type ConversationProbeObservation,
  type ConversationProbePort,
} from "../packages/core/src/channels/conversation-process-verification.ts"

function observation(
  executionStatus: ConversationProbeObservation["requestOutcome"]["executionStatus"] = "succeeded",
): ConversationProbeObservation {
  return {
    evidenceMode: "fixture",
    smokeStatus: "passed",
    requestOutcome: {
      executionStatus,
      deliveryStatus: executionStatus === "succeeded" ? "delivered" : "not_started",
    },
    binding: {
      runId: "run:webui:basic",
      requestGroupId: "run:webui:basic",
      sessionId: "session:webui",
    },
    receipts: {
      requestDiagnosisReceiptId: "receipt:diagnosis",
      solutionPlanReceiptId: "receipt:plan",
      resultReviewReceiptId: "receipt:review",
      finalResponseReceiptId: "receipt:final-response",
      decisionReceiptOrderValid: true,
    },
    finalization: {
      rootOwnerFinalized: true,
      finalAnswerCount: 1,
    },
    deliveryTarget: {
      channel: "webui",
      targetRef: "session:webui",
    },
  }
}

function ports(
  observed: ConversationProbeObservation,
): {
  probe: ConversationProbePort
  control: ConversationControlProbePort
  delivery: ConversationDeliveryPostCheckPort
} {
  return {
    probe: {
      start: vi.fn(async () => ({
        status: "success" as const,
        value: {
          runId: observed.binding.runId,
          requestGroupId: observed.binding.requestGroupId,
          sessionId: observed.binding.sessionId,
        },
      })),
      observe: vi.fn(async () => ({ status: "success" as const, value: observed })),
    },
    control: {
      interact: vi.fn(async () => ({ status: "success" as const })),
      cancel: vi.fn(async () => ({ status: "success" as const })),
    },
    delivery: {
      verifyDelivery: vi.fn(async () => ({
        status: "success" as const,
        value: {
          delivered: true,
          channel: observed.deliveryTarget.channel,
          targetRef: observed.deliveryTarget.targetRef,
          receiptRef: "receipt:delivery",
        },
      })),
    },
  }
}

const input = {
  scenarioId: "webui.basic_query",
  channel: "webui" as const,
  userRequest: "상태를 알려줘",
  expectedExecutionStatus: "succeeded" as const,
  expectedTargetRef: "session:webui",
  allowedEffects: [] as const,
  userReportExpected: true,
}

describe("conversation process verification contract", () => {
  it("runs all five WebUI and Telegram dry scenarios through the same Application verifier", async () => {
    const scenarioKinds = [
      "basic_query",
      "web_skill",
      "approval_required_tool",
      "artifact_delivery",
      "failure_tool",
    ] as const
    const results = []

    for (const channel of ["webui", "telegram"] as const) {
      for (const scenarioKind of scenarioKinds) {
        const expectedExecutionStatus =
          scenarioKind === "failure_tool" ? "exhausted" as const : "succeeded" as const
        const targetRef = channel === "webui" ? "session:webui" : "thread:telegram"
        const observed = observation(expectedExecutionStatus)
        observed.requestOutcome.deliveryStatus = "delivered"
        observed.binding = {
          runId: `run:${channel}:${scenarioKind}`,
          requestGroupId: `run:${channel}:${scenarioKind}`,
          sessionId: `session:${channel}`,
        }
        observed.deliveryTarget = { channel, targetRef }
        const requiresCapabilityAdmission = [
          "web_skill",
          "approval_required_tool",
          "artifact_delivery",
        ].includes(scenarioKind)
        if (requiresCapabilityAdmission) {
          observed.receipts.capabilityAdmissionReceiptId =
            `receipt:capability:${channel}:${scenarioKind}`
        }

        results.push(await new VerifyConversationProcessUseCase(
          ports(observed),
        ).execute({
          scenarioId: `${channel}.${scenarioKind}`,
          channel,
          userRequest: "fixture request",
          expectedExecutionStatus,
          expectedTargetRef: targetRef,
          allowedEffects: [],
          userReportExpected: true,
          requiresCapabilityAdmission,
        }))
      }
    }

    expect(results).toHaveLength(10)
    expect(results.every((result) =>
      result.verificationStatus === "success"
      && result.releaseReadiness === "passed")).toBe(true)
  })

  it("keeps verifier, smoke, observed request, and release readiness statuses separate", async () => {
    const observed = observation()
    const useCase = new VerifyConversationProcessUseCase(ports(observed))

    await expect(useCase.execute(input)).resolves.toMatchObject({
      verificationStatus: "success",
      smokeStatus: "passed",
      observedRequestOutcome: {
        executionStatus: "succeeded",
        deliveryStatus: "delivered",
      },
      releaseReadiness: "passed",
      evidenceMode: "fixture",
    })
  })

  it.each([
    {
      executionStatus: "cancelled" as const,
      verificationStatus: "cancelled",
      releaseReadiness: "blocked",
    },
    {
      executionStatus: "awaiting_user" as const,
      verificationStatus: "additional_input_required",
      releaseReadiness: "blocked",
    },
  ])(
    "returns $verificationStatus without rewriting the observed request outcome",
    async ({ executionStatus, verificationStatus, releaseReadiness }) => {
      const observed = observation(executionStatus)
      const useCase = new VerifyConversationProcessUseCase(ports(observed))

      await expect(useCase.execute({
        ...input,
        expectedExecutionStatus: executionStatus,
        userReportExpected: false,
      })).resolves.toMatchObject({
        verificationStatus,
        smokeStatus: "passed",
        observedRequestOutcome: {
          executionStatus,
          deliveryStatus: "not_started",
        },
        releaseReadiness,
      })
    },
  )

  it("fails when the distinct solution-plan receipt is missing", async () => {
    const observed = observation()
    observed.receipts.solutionPlanReceiptId = ""
    const useCase = new VerifyConversationProcessUseCase(ports(observed))

    await expect(useCase.execute(input)).resolves.toMatchObject({
      verificationStatus: "failure",
      smokeStatus: "passed",
      releaseReadiness: "failed",
      reasonCode: "solution_plan_receipt_missing",
    })
  })

  it("fails when decision receipts do not preserve canonical stage order", async () => {
    const observed = observation()
    observed.receipts.decisionReceiptOrderValid = false
    const useCase = new VerifyConversationProcessUseCase(ports(observed))

    await expect(useCase.execute(input)).resolves.toMatchObject({
      verificationStatus: "failure",
      reasonCode: "decision_receipt_order_invalid",
    })
  })

  it("fails when observation receipts are attributed to a different run binding", async () => {
    const observed = observation()
    const configured = ports(observed)
    configured.probe.start = vi.fn(async () => ({
      status: "success" as const,
      value: {
        runId: "run:webui:expected",
        requestGroupId: "run:webui:expected",
        sessionId: "session:webui",
      },
    }))
    const useCase = new VerifyConversationProcessUseCase(configured)

    await expect(useCase.execute(input)).resolves.toMatchObject({
      verificationStatus: "failure",
      reasonCode: "observed_run_binding_mismatch",
    })
  })

  it("requires capability admission only for an explicitly declared action scenario", async () => {
    const missing = observation()
    const missingUseCase = new VerifyConversationProcessUseCase(ports(missing))
    await expect(
      missingUseCase.execute({ ...input, requiresCapabilityAdmission: true }),
    ).resolves.toMatchObject({
      verificationStatus: "failure",
      reasonCode: "capability_admission_receipt_missing",
    })

    const admitted = observation()
    admitted.receipts.capabilityAdmissionReceiptId =
      "receipt:capability-admission"
    const admittedUseCase = new VerifyConversationProcessUseCase(ports(admitted))
    await expect(
      admittedUseCase.execute({ ...input, requiresCapabilityAdmission: true }),
    ).resolves.toMatchObject({
      verificationStatus: "success",
      releaseReadiness: "passed",
    })

    const directUseCase = new VerifyConversationProcessUseCase(
      ports(observation()),
    )
    await expect(directUseCase.execute(input)).resolves.toMatchObject({
      verificationStatus: "success",
    })
  })

  it("requires a delivery post-check for a promised user report", async () => {
    const observed = observation()
    const configured = ports(observed)
    configured.delivery.verifyDelivery = vi.fn(async () => ({
      status: "failure" as const,
      reasonCode: "visible_delivery_missing",
    }))
    const useCase = new VerifyConversationProcessUseCase(configured)

    await expect(useCase.execute(input)).resolves.toMatchObject({
      verificationStatus: "failure",
      smokeStatus: "passed",
      releaseReadiness: "failed",
      reasonCode: "visible_delivery_missing",
    })
  })

  it("does not promote a delivery transport acknowledgement when the request outcome was not delivered", async () => {
    const observed = observation()
    observed.requestOutcome.deliveryStatus = "not_started"
    const configured = ports(observed)
    const useCase = new VerifyConversationProcessUseCase(configured)

    await expect(useCase.execute(input)).resolves.toMatchObject({
      verificationStatus: "failure",
      reasonCode: "request_outcome_delivery_missing",
    })
    expect(configured.delivery.verifyDelivery).not.toHaveBeenCalled()
  })
})
