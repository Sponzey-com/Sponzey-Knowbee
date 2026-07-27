import { describe, expect, it, vi } from "vitest"
import {
  type LlmRequestIntakeDecision,
  type RequestIntakeContext,
  admitLlmRequestIntake,
  createLlmRequestIntakeReceipt,
  runLlmRequestIntakeProvider,
} from "../packages/core/src/contracts/llm-request-intake.ts"

const context: RequestIntakeContext = {
  requestId: "request:87",
  originalRequest: "Use the local extension to send the verified report to team@example.com.",
  priorInstructions: [
    { instructionId: "instruction:old", sequence: 1, text: "Use any available method." },
  ],
  latestInstruction: {
    instructionId: "instruction:latest",
    sequence: 2,
    text: "Use the local extension to send the verified report to team@example.com.",
  },
  contextCandidates: [
    { contextRef: "conversation:method", source: "conversation", content: "Use any method." },
    { contextRef: "memory:recipient", source: "memory", content: "The team address is current." },
  ],
}

function decision(overrides: Partial<LlmRequestIntakeDecision> = {}): LlmRequestIntakeDecision {
  return {
    schemaVersion: 1,
    requestId: "request:87",
    originalRequest: context.originalRequest,
    goal: "Deliver a verified report.",
    desiredResult: "The verified report is delivered to team@example.com.",
    explicitExecutionMethod: "local extension",
    completionCriteria: ["A delivery receipt names team@example.com."],
    forbiddenActions: ["Do not use an unrelated remote extension."],
    allowedTargets: ["team@example.com"],
    deliveryDestination: "team@example.com",
    approvalRequiredSideEffects: ["external report delivery"],
    contextAssessments: [
      {
        contextRef: "conversation:method",
        relevant: false,
        reason: "It conflicts with the latest method restriction.",
      },
      {
        contextRef: "memory:recipient",
        relevant: true,
        reason: "It confirms the requested recipient context.",
      },
    ],
    selectedContextRefs: ["memory:recipient"],
    instructionLineage: [
      { instructionId: "instruction:old", sequence: 1 },
      { instructionId: "instruction:latest", sequence: 2 },
    ],
    latestInstructionId: "instruction:latest",
    reason: "The latest user instruction restricts execution to the local extension.",
    ...overrides,
  }
}

function admit(
  decisionValue: LlmRequestIntakeDecision = decision(),
  contextValue: RequestIntakeContext = context,
) {
  return admitLlmRequestIntake({
    context: contextValue,
    decision: decisionValue,
    receipt: createLlmRequestIntakeReceipt({
      receiptId: "receipt:intake:87",
      decision: decisionValue,
    }),
  })
}

describe("Task 087 LLM request intake contract", () => {
  it("runs the LLM provider with exact immutable context and admits a bound decision", async () => {
    const analyzeRequest = vi.fn(async () => decision())
    const result = await runLlmRequestIntakeProvider({
      provider: { analyzeRequest },
      receiptId: "receipt:intake:87",
      context,
    })

    expect(analyzeRequest).toHaveBeenCalledWith(context)
    expect(admitLlmRequestIntake({ context, ...result })).toMatchObject({
      status: "admitted",
      requestId: "request:87",
      originalRequest: context.originalRequest,
      latestInstructionId: "instruction:latest",
      selectedContextRefs: ["memory:recipient"],
      constraints: {
        completionCriteria: ["A delivery receipt names team@example.com."],
        forbiddenActions: ["Do not use an unrelated remote extension."],
        allowedTargets: ["team@example.com"],
        deliveryDestination: "team@example.com",
        approvalRequiredSideEffects: ["external report delivery"],
      },
    })
  })

  it("rejects rewritten or incomplete authoritative request fields", () => {
    expect(admit(decision({ originalRequest: "Send a report." }))).toMatchObject({
      status: "rejected",
      reasonCodes: ["original_request_mismatch"],
    })
    expect(admit(decision({ desiredResult: "" }))).toMatchObject({
      status: "rejected",
      reasonCodes: ["intake_schema_invalid"],
    })
    expect(
      admit(
        decision({
          completionCriteria: undefined,
        } as unknown as Partial<LlmRequestIntakeDecision>),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["intake_schema_invalid"] })
  })

  it("rejects unrelated context selection and stale instruction precedence", () => {
    expect(
      admit(
        decision({
          selectedContextRefs: ["conversation:method", "memory:recipient"],
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["context_selection_invalid"] })
    expect(
      admit(
        decision({
          instructionLineage: [
            { instructionId: "instruction:latest", sequence: 2 },
            { instructionId: "instruction:old", sequence: 1 },
          ],
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["instruction_lineage_invalid"] })
    expect(admit(decision({ latestInstructionId: "instruction:old" }))).toMatchObject({
      status: "rejected",
      reasonCodes: ["latest_instruction_not_authoritative"],
    })
  })

  it("rejects request scope and receipt tampering", () => {
    expect(admit(decision({ requestId: "request:other" }))).toMatchObject({
      status: "rejected",
      reasonCodes: ["request_scope_mismatch"],
    })
    const decisionValue = decision()
    const receipt = createLlmRequestIntakeReceipt({
      receiptId: "receipt:intake:87",
      decision: decisionValue,
    })
    expect(
      admitLlmRequestIntake({
        context,
        decision: { ...decisionValue, goal: "Tampered goal." },
        receipt,
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["intake_receipt_mismatch"] })
  })
})
