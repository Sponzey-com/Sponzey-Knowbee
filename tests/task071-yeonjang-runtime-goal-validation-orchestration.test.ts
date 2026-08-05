import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
  type SideEffectOperationEvent,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import type { LlmResultDiagnosisRecord } from "../packages/core/src/contracts/work-record.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { SqliteSideEffectOperationRepository } from "../packages/core/src/db/side-effect-operation-repository.ts"
import { createRootRun } from "../packages/core/src/runs/store.js"
import {
  reserveSideEffectOperation,
  transitionReservedSideEffectOperation,
} from "../packages/core/src/runs/side-effect-operation-use-case.ts"
import { validateRuntimeYeonjangSideEffectGoal } from "../packages/core/src/yeonjang/side-effect-goal-validation-runtime.ts"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>

function diagnosis(overrides: Partial<LlmResultDiagnosisRecord> = {}): LlmResultDiagnosisRecord {
  return {
    diagnosis_summary: "The manual side-effect result satisfies the user's goal.",
    sufficiency: "sufficient",
    missing_information: [],
    conflicts: [],
    risk: "low",
    risks: [],
    confidence: "high",
    recommended_action: "final_report",
    reason: "The sanitized evidence supports completion.",
    ...overrides,
  }
}

function identity() {
  return buildSideEffectOperationIdentity({
    runId: "run-071",
    workId: "work:root:run-071",
    stepKey: "step-click",
    adapterId: "tool:mouse_click",
    targetFingerprint: `sha256:${"a".repeat(64)}`,
    paramsFingerprint: `sha256:${"b".repeat(64)}`,
  })
}

function receipt(operationIdentity: ReturnType<typeof identity>, event: SideEffectOperationEvent, revision: number) {
  return buildSideEffectOperationReceipt({
    identity: operationIdentity,
    event,
    operationRevision: revision,
    evidenceFingerprint: `sha256:${revision.toString(16).repeat(64).slice(0, 64)}`,
    evidenceRefs: [`operation-evidence:${event.toLowerCase()}:071`],
    issuedAt: revision,
  })
}

function saveManualOperation() {
  const repository = new SqliteSideEffectOperationRepository(getDb(), () => 1)
  const operationIdentity = identity()
  const reserved = reserveSideEffectOperation({ repository, identity: operationIdentity })
  if (reserved.status === "rejected") throw new Error(reserved.reasonCode)
  for (const [index, event] of [
    "START_EFFECT",
    "RECORD_EFFECT",
    "BEGIN_VERIFICATION",
    "VERIFICATION_FAILED",
    "MARK_MANUAL",
  ].entries()) {
    const changed = transitionReservedSideEffectOperation({
      repository,
      operationId: operationIdentity.operationId,
      scopeId: operationIdentity.scopeId,
      expectedRevision: index,
      event: event as SideEffectOperationEvent,
      receipt: receipt(operationIdentity, event as SideEffectOperationEvent, index + 1),
    })
    if (changed.status !== "applied") throw new Error(changed.reasonCode)
  }
  return operationIdentity
}

const baseRuntimeInput = {
  expectedRunId: "run-071",
  expectedWorkId: "work:root:run-071",
  ownerAgentName: "노비",
  toolName: "mouse_click",
  methodIds: ["mouse.click"],
  group: "input",
  riskLevel: "moderate" as const,
  requiresApproval: true,
  targetRef: "yeonjang-main",
  userRequestSummary: "다음 버튼을 클릭한다.",
  expectedOutput: "다음 단계가 보인다.",
  publicToolOutput: "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
  sanitizedObservedStateSummary: "manual side-effect with post cursor and screen summary",
  collectedAt: 71,
}

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-runtime-goal-validation-"))
  paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  getDb({ paths })
  const now = Date.now()
  insertSession({
    id: "session-071",
    source: "webui",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({ id: "run-071", sessionId: "session-071", prompt: "click", source: "webui" })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("Task 071 Yeonjang runtime goal validation orchestration", () => {
  it("turns a scoped manual tool result into normalized Yeonjang evidence", async () => {
    const operationIdentity = saveManualOperation()
    const result = await validateRuntimeYeonjangSideEffectGoal({
      ...baseRuntimeInput,
      db: getDb(),
      manualResultDetails: {
        kind: "side_effect_manual_intervention",
        operationId: operationIdentity.operationId,
        reasonCode: "side_effect_irreversible",
        goalValidationCandidate: true,
      },
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => diagnosis(),
      },
    })

    expect(result).toMatchObject({
      status: "validated",
      publicSummary: {
        operationId: operationIdentity.operationId,
        runId: "run-071",
        workId: "work:root:run-071",
        state: "MANUAL_INTERVENTION",
      },
      evidence: {
        schemaVersion: "yeonjang-evidence-v1",
        toolName: "mouse_click",
        postCheck: {
          kind: "goal_validated",
          diagnosisReceiptId: "diagnosis:work:root:run-071:step-click:result",
        },
        rawPayloadVisibility: "audit_only",
      },
    })
  })

  it("does not call validation for non-candidate details", async () => {
    const result = await validateRuntimeYeonjangSideEffectGoal({
      ...baseRuntimeInput,
      db: getDb(),
      manualResultDetails: { kind: "side_effect_manual_intervention", goalValidationCandidate: false },
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => {
          throw new Error("should not be called")
        },
      },
    })

    expect(result).toEqual({
      status: "not_validated",
      reasonCode: "manual_result_not_candidate",
    })
  })

  it("keeps scope mismatch out of LLM goal validation", async () => {
    const operationIdentity = saveManualOperation()
    const result = await validateRuntimeYeonjangSideEffectGoal({
      ...baseRuntimeInput,
      db: getDb(),
      expectedRunId: "run-other",
      manualResultDetails: {
        kind: "side_effect_manual_intervention",
        operationId: operationIdentity.operationId,
        goalValidationCandidate: true,
      },
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => {
          throw new Error("should not be called")
        },
      },
    })

    expect(result).toEqual({
      status: "not_validated",
      reasonCode: "candidate_not_ready",
      detail: "operation_run_scope_mismatch",
    })
  })
})
