import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type StructuredExecutionContractDecision,
  type StructuredExecutionContractInput,
  admitStructuredExecutionContract,
  createStructuredExecutionContractReceipt,
} from "../packages/core/src/contracts/structured-execution-contract.ts"

const input: StructuredExecutionContractInput = {
  requestId: "request:89",
  workId: "work:89",
  diagnosisReceiptId: "receipt:intake:89",
  diagnosedGoal: "Create and verify the requested report.",
  diagnosedConstraints: ["Do not overwrite existing files."],
  diagnosedCompletionCriteria: ["The report exists.", "Validation evidence is recorded."],
}

function decision(
  overrides: Partial<StructuredExecutionContractDecision> = {},
): StructuredExecutionContractDecision {
  return {
    schemaVersion: 1,
    requestId: "request:89",
    workId: "work:89",
    diagnosisReceiptId: "receipt:intake:89",
    goal: input.diagnosedGoal,
    userConstraints: [...input.diagnosedConstraints],
    completionCriteria: [...input.diagnosedCompletionCriteria],
    steps: [
      {
        stepId: "create",
        ownerAgentName: "마당쇠",
        selectedMeans: ["filesystem.write"],
        expectedOutput: "A report file.",
        completionCriteria: ["The report exists."],
        sideEffects: ["filesystem_write"],
        risks: ["existing_file_collision"],
        requiredApprovals: [],
        validationMethod: "Read the created path and compare its contents.",
      },
      {
        stepId: "verify",
        ownerAgentName: "마당쇠",
        selectedMeans: ["filesystem.read"],
        expectedOutput: "Validation evidence.",
        completionCriteria: ["Validation evidence is recorded."],
        sideEffects: [],
        risks: [],
        requiredApprovals: [],
        validationMethod: "Confirm both completion criteria against direct evidence.",
      },
    ],
    nextActionStepId: "create",
    reason: "The LLM selected an ordered create-and-verify procedure.",
    ...overrides,
  }
}

function admit(decisionValue: StructuredExecutionContractDecision = decision()) {
  return admitStructuredExecutionContract({
    input,
    decision: decisionValue,
    receipt: createStructuredExecutionContractReceipt({
      receiptId: "receipt:execution-contract:89",
      decision: decisionValue,
    }),
  })
}

describe("Task 089 structured execution contract", () => {
  it("admits exact diagnosis lineage and a complete structured procedure", () => {
    expect(admit()).toMatchObject({
      status: "admitted",
      requestId: "request:89",
      workId: "work:89",
      goal: input.diagnosedGoal,
      userConstraints: input.diagnosedConstraints,
      completionCriteria: input.diagnosedCompletionCriteria,
      stepIds: ["create", "verify"],
      nextActionStepId: "create",
    })
  })

  it("rejects omitted constraints or completion criteria and invented goals", () => {
    expect(admit(decision({ userConstraints: [] }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["constraint_lineage_mismatch"]),
    })
    expect(admit(decision({ completionCriteria: ["The report exists."] }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["completion_lineage_mismatch"]),
    })
    expect(admit(decision({ goal: "Delete every report." }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["goal_lineage_mismatch"]),
    })
  })

  it("rejects incomplete steps, duplicate IDs, invalid next action, scope, and receipt tampering", () => {
    const incomplete = decision()
    const firstStep = incomplete.steps[0]
    if (!firstStep) throw new Error("Test fixture requires a first step.")
    incomplete.steps[0] = { ...firstStep, validationMethod: "" }
    expect(admit(incomplete)).toMatchObject({
      status: "rejected",
      reasonCodes: ["execution_contract_schema_invalid"],
    })
    expect(admit(decision({ steps: [firstStep, firstStep] }))).toMatchObject({
      status: "rejected",
      reasonCodes: ["execution_contract_schema_invalid"],
    })
    expect(admit(decision({ nextActionStepId: "invented" }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["next_action_step_missing"]),
    })
    expect(admit(decision({ requestId: "request:other" }))).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["execution_scope_mismatch"]),
    })
    const decisionValue = decision()
    expect(
      admitStructuredExecutionContract({
        input,
        decision: { ...decisionValue, reason: "Tampered." },
        receipt: createStructuredExecutionContractReceipt({
          receiptId: "receipt:execution-contract:89",
          decision: decisionValue,
        }),
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["execution_contract_receipt_mismatch"]),
    })
  })

  it("contains no keyword, regex, or fixed semantic route selection", () => {
    const source = readFileSync(
      "packages/core/src/contracts/structured-execution-contract.ts",
      "utf8",
    )
    expect(source).not.toMatch(/new RegExp|\.match\(|request\.toLowerCase|KEYWORD|ROUTE_BY_/u)
    expect(source).not.toContain("intentType")
    expect(source).not.toContain("semanticRoute")
  })
})
