import { describe, expect, it, vi } from "vitest"
import {
  type LlmClarificationDecision,
  type LlmClarificationInput,
  admitLlmClarification,
  createLlmClarificationReceipt,
  runLlmClarificationProvider,
} from "../packages/core/src/contracts/llm-clarification-admission.ts"

const input: LlmClarificationInput = {
  requestId: "request:88",
  originalRequest: "현재 주가를 지정한 보고서 폴더에 저장해줘.",
  missingInformationCandidates: [
    {
      fieldId: "current_price",
      description: "Current market price",
      systemCanResolve: true,
      capabilityRefs: ["web.search"],
    },
    {
      fieldId: "report_folder",
      description: "User-selected report folder",
      systemCanResolve: false,
      capabilityRefs: [],
    },
  ],
}

function decision(overrides: Partial<LlmClarificationDecision> = {}): LlmClarificationDecision {
  return {
    schemaVersion: 1,
    requestId: "request:88",
    requestMeaning: "Retrieve the current market price and save a report in the user's folder.",
    completionCriteria: [
      "Current-price evidence is present.",
      "The report exists in the selected folder.",
    ],
    missingInformationAssessments: [
      {
        fieldId: "current_price",
        impact: "changes_result",
        reason: "The current value is required, but the system can retrieve it.",
      },
      {
        fieldId: "report_folder",
        impact: "changes_result",
        reason: "The destination changes where the report is written.",
      },
    ],
    selectedAction: "ask_clarification",
    clarificationFieldIds: ["report_folder"],
    clarificationQuestion: "보고서를 저장할 폴더를 알려주세요.",
    reason: "Only the user-selected destination remains unavailable to the system.",
    ...overrides,
  }
}

function admit(
  decisionValue: LlmClarificationDecision = decision(),
  inputValue: LlmClarificationInput = input,
) {
  return admitLlmClarification({
    input: inputValue,
    decision: decisionValue,
    receipt: createLlmClarificationReceipt({
      receiptId: "receipt:clarification:88",
      decision: decisionValue,
    }),
  })
}

describe("Task 088 LLM clarification admission", () => {
  it("admits one concise clarification for the exact outcome-changing user-only field", async () => {
    const analyzeClarification = vi.fn(async () => decision())
    const result = await runLlmClarificationProvider({
      provider: { analyzeClarification },
      receiptId: "receipt:clarification:88",
      input,
    })

    expect(analyzeClarification).toHaveBeenCalledWith(input)
    expect(admitLlmClarification({ input, ...result })).toEqual({
      status: "clarification_required",
      requestId: "request:88",
      requestMeaning: decision().requestMeaning,
      completionCriteria: decision().completionCriteria,
      clarificationFieldIds: ["report_folder"],
      clarificationQuestion: "보고서를 저장할 폴더를 알려주세요.",
      receiptId: "receipt:clarification:88",
    })
  })

  it("rejects low-impact, invented, or incomplete clarification targets", () => {
    const lowImpact = decision({
      missingInformationAssessments: decision().missingInformationAssessments.map((item) =>
        item.fieldId === "report_folder" ? { ...item, impact: "does_not_change_result" } : item,
      ),
    })
    expect(admit(lowImpact)).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["clarification_not_required"]),
    })
    expect(admit(decision({ clarificationFieldIds: ["invented_field"] }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["clarification_targets_mismatch"]),
    })
    expect(admit(decision({ clarificationQuestion: "" }))).toMatchObject({
      status: "rejected",
      reasonCodes: ["clarification_schema_invalid"],
    })
  })

  it("never asks the user for a field that a current system capability can resolve", () => {
    expect(
      admit(decision({ clarificationFieldIds: ["current_price", "report_folder"] })),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["system_resolvable_information_requested"]),
    })
  })

  it("continues when every outcome-changing gap is system resolvable", () => {
    const systemInput: LlmClarificationInput = {
      ...input,
      missingInformationCandidates: input.missingInformationCandidates.slice(0, 1),
    }
    const continueDecision = decision({
      missingInformationAssessments: decision().missingInformationAssessments.slice(0, 1),
      selectedAction: "continue",
      clarificationFieldIds: [],
      clarificationQuestion: null,
    })
    expect(admit(continueDecision, systemInput)).toMatchObject({
      status: "continue",
      requestId: "request:88",
      completionCriteria: decision().completionCriteria,
    })
  })

  it("rejects blank LLM analysis, request scope mismatch, and receipt tampering", () => {
    expect(admit(decision({ requestMeaning: "" }))).toMatchObject({
      status: "rejected",
      reasonCodes: ["clarification_schema_invalid"],
    })
    expect(admit(decision({ requestId: "request:other" }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["request_scope_mismatch"]),
    })
    const decisionValue = decision()
    expect(
      admitLlmClarification({
        input,
        decision: { ...decisionValue, requestMeaning: "Tampered meaning." },
        receipt: createLlmClarificationReceipt({
          receiptId: "receipt:clarification:88",
          decision: decisionValue,
        }),
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["clarification_receipt_mismatch"]),
    })
  })
})
