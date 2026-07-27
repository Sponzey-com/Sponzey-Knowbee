import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  validateWorkRecord,
  type WorkRecord,
} from "../packages/core/src/contracts/work-record.ts"

function validWorkRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1",
    owner_agent_name: "노비",
    source: "user",
    status: "running",
    user_request_summary: "Create a short plan.",
    request_diagnosis: {
      diagnosis_summary: "The user asked for a plan.",
      intent: "plan_request",
      goal: "Create a short plan.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "Planning is directly requested.",
    },
    step_plan: [{
      step_id: "step-1",
      owner_agent_name: "노비",
      action_type: "plan",
      input_refs: ["user-request"],
      expected_output: "A concise plan.",
      completion_criteria: "The plan has ordered steps.",
      status: "completed",
    }],
    step_results: [{
      step_id: "step-1",
      status: "completed",
      output_ref: "result-1",
      evidence_refs: ["plan-draft"],
      completed_at: 1,
    }],
    result_diagnosis: {
      diagnosis_summary: "The plan satisfies the request.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The result meets the completion criteria.",
    },
    retry_count: 0,
    retry_limit: 2,
    action_decision: {
      selected_action: "final_report",
      reason: "All required steps are complete.",
    },
    ...overrides,
  }
}

describe("task0726 diagnosis array item contract", () => {
  it("keeps valid diagnosis arrays accepted", () => {
    const result = validateWorkRecord(validWorkRecord({
      request_diagnosis: {
        ...validWorkRecord().request_diagnosis,
        constraints: ["Keep the answer short."],
        missing_information: ["Target platform is unknown."],
      },
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        conflicts: ["No conflict."],
        risks: ["Low risk."],
      },
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects request diagnosis blank constraint items", () => {
    const result = validateWorkRecord(validWorkRecord({
      request_diagnosis: {
        ...validWorkRecord().request_diagnosis,
        constraints: ["  "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.request_diagnosis.constraints[0]",
      code: "contract_validation_failed",
      message: "request_diagnosis.constraints items must be non-empty.",
    })
  })

  it("rejects request diagnosis blank missing information items", () => {
    const result = validateWorkRecord(validWorkRecord({
      request_diagnosis: {
        ...validWorkRecord().request_diagnosis,
        missing_information: ["  "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.request_diagnosis.missing_information[0]",
      code: "contract_validation_failed",
      message: "request_diagnosis.missing_information items must be non-empty.",
    })
  })

  it("rejects request diagnosis duplicate constraint items after trim", () => {
    const result = validateWorkRecord(validWorkRecord({
      request_diagnosis: {
        ...validWorkRecord().request_diagnosis,
        constraints: ["Keep the answer short.", " Keep the answer short. "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.request_diagnosis.constraints[1]",
      code: "contract_validation_failed",
      message: "request_diagnosis.constraints items must be unique.",
    })
  })

  it("rejects request diagnosis duplicate missing information items after trim", () => {
    const result = validateWorkRecord(validWorkRecord({
      request_diagnosis: {
        ...validWorkRecord().request_diagnosis,
        missing_information: ["Target platform is unknown.", " Target platform is unknown. "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.request_diagnosis.missing_information[1]",
      code: "contract_validation_failed",
      message: "request_diagnosis.missing_information items must be unique.",
    })
  })

  it("rejects result diagnosis blank missing information items", () => {
    const result = validateWorkRecord(validWorkRecord({
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        missing_information: ["  "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.result_diagnosis.missing_information[0]",
      code: "contract_validation_failed",
      message: "result_diagnosis.missing_information items must be non-empty.",
    })
  })

  it("rejects result diagnosis blank conflict items", () => {
    const result = validateWorkRecord(validWorkRecord({
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        conflicts: ["  "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.result_diagnosis.conflicts[0]",
      code: "contract_validation_failed",
      message: "result_diagnosis.conflicts items must be non-empty.",
    })
  })

  it("rejects result diagnosis blank risk items", () => {
    const result = validateWorkRecord(validWorkRecord({
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        risks: ["  "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.result_diagnosis.risks[0]",
      code: "contract_validation_failed",
      message: "result_diagnosis.risks items must be non-empty.",
    })
  })

  it("rejects result diagnosis duplicate missing information items after trim", () => {
    const result = validateWorkRecord(validWorkRecord({
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        missing_information: ["Evidence is incomplete.", " Evidence is incomplete. "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.result_diagnosis.missing_information[1]",
      code: "contract_validation_failed",
      message: "result_diagnosis.missing_information items must be unique.",
    })
  })

  it("rejects result diagnosis duplicate conflict items after trim", () => {
    const result = validateWorkRecord(validWorkRecord({
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        conflicts: ["One result conflicts with another.", " One result conflicts with another. "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.result_diagnosis.conflicts[1]",
      code: "contract_validation_failed",
      message: "result_diagnosis.conflicts items must be unique.",
    })
  })

  it("rejects result diagnosis duplicate risk items after trim", () => {
    const result = validateWorkRecord(validWorkRecord({
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        risks: ["User confirmation is required.", " User confirmation is required. "],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.result_diagnosis.risks[1]",
      code: "contract_validation_failed",
      message: "result_diagnosis.risks items must be unique.",
    })
  })

  it("documents diagnosis array item rules in work_record", () => {
    const workRecord = readFileSync(join(process.cwd(), "prompts", "work_record.md"), "utf-8")

    expect(workRecord).toContain("Diagnosis array items must be non-empty after trim.")
    expect(workRecord).toContain("Diagnosis array items must be unique after trim.")
  })
})
