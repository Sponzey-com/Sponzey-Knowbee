import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type ExecutionModelDecision,
  type ExecutionModelInput,
  admitExecutionModel,
  createExecutionModelReceipt,
} from "../packages/core/src/contracts/execution-model-admission.ts"

const directInput: ExecutionModelInput = {
  requestId: "request:90",
  workId: "work:90",
  executionContractReceiptId: "receipt:contract:90",
  steps: [
    {
      stepId: "answer",
      actionKind: "direct_response",
      sideEffect: "none",
      requiresApproval: false,
      retryOrReentryPossible: false,
    },
  ],
  executionReceipts: [
    { receiptId: "receipt:answer", workId: "work:90", stepId: "answer", status: "succeeded" },
  ],
  completionRequested: true,
}

function decision(
  selectedMode: ExecutionModelDecision["selectedMode"] = "direct_sequential",
): ExecutionModelDecision {
  return {
    schemaVersion: 1,
    requestId: "request:90",
    workId: "work:90",
    executionContractReceiptId: "receipt:contract:90",
    selectedMode,
    reason: "The LLM selected the minimum execution model for the structured steps.",
  }
}

function admit(input: ExecutionModelInput, decisionValue: ExecutionModelDecision) {
  return admitExecutionModel({
    input,
    decision: decisionValue,
    receipt: createExecutionModelReceipt({
      receiptId: "receipt:model:90",
      decision: decisionValue,
    }),
  })
}

describe("Task 090 minimum execution model and step coverage", () => {
  it("completes an LLM-only request as one direct sequential response step", () => {
    expect(admit(directInput, decision())).toEqual({
      status: "completed",
      requestId: "request:90",
      workId: "work:90",
      selectedMode: "direct_sequential",
      executedStepIds: ["answer"],
      receiptId: "receipt:model:90",
    })
  })

  it("uses a sequential function only for one safe read and managed state for complex work", () => {
    const safeRead: ExecutionModelInput = {
      ...directInput,
      steps: [
        {
          stepId: "read",
          actionKind: "read",
          sideEffect: "none",
          requiresApproval: false,
          retryOrReentryPossible: false,
        },
      ],
      executionReceipts: [
        { receiptId: "receipt:read", workId: "work:90", stepId: "read", status: "succeeded" },
      ],
    }
    expect(admit(safeRead, decision("safe_read_sequential"))).toMatchObject({
      status: "completed",
      selectedMode: "safe_read_sequential",
    })

    const readStep = safeRead.steps[0]
    if (!readStep) throw new Error("Test fixture requires one safe read step.")
    const complexInputs: ExecutionModelInput[] = [
      { ...safeRead, steps: [{ ...readStep, actionKind: "write", sideEffect: "write" }] },
      { ...safeRead, steps: [{ ...readStep, requiresApproval: true }] },
      { ...safeRead, steps: [{ ...readStep, retryOrReentryPossible: true }] },
      {
        ...safeRead,
        steps: [readStep, { ...readStep, stepId: "validate", actionKind: "validate" }],
        executionReceipts: [],
        completionRequested: false,
      },
    ]
    for (const complex of complexInputs) {
      expect(admit(complex, decision("safe_read_sequential"))).toMatchObject({
        status: "rejected",
        reasonCodes: expect.arrayContaining(["execution_mode_mismatch"]),
      })
      expect(admit(complex, decision("managed_state_machine"))).toMatchObject({
        selectedMode: "managed_state_machine",
      })
    }
  })

  it("cannot complete until every analyzed step has one same-work successful receipt", () => {
    expect(admit({ ...directInput, executionReceipts: [] }, decision())).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["analyzed_steps_not_executed"]),
    })
    expect(
      admit(
        {
          ...directInput,
          executionReceipts: [
            {
              receiptId: "receipt:answer",
              workId: "work:other",
              stepId: "answer",
              status: "succeeded",
            },
          ],
        },
        decision(),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["execution_receipt_scope_mismatch"]),
    })
    expect(
      admit(
        {
          ...directInput,
          executionReceipts: [
            { receiptId: "receipt:answer", workId: "work:90", stepId: "answer", status: "failed" },
          ],
        },
        decision(),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["analyzed_steps_not_executed"]),
    })
  })

  it("keeps mode selection free of semantic text routing", () => {
    const source = readFileSync("packages/core/src/contracts/execution-model-admission.ts", "utf8")
    expect(source).not.toMatch(/new RegExp|\.match\(|request\.toLowerCase|KEYWORD|ROUTE_BY_/u)
  })
})
