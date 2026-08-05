import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
  parseCapabilitySelectionDecisionTraceDetail,
} from "../packages/core/src/contracts/capability-selection-decision-trace.ts"
import { SqliteLlmInvocationReceiptRepository } from "../packages/core/src/db/llm-invocation-receipt-repository.ts"
import {
  getDb,
  listDecisionTracesForRun,
} from "../packages/core/src/db/index.js"
import { createSqliteCapabilitySelectionDecisionTraceSink } from "../packages/core/src/runs/capability-selection-decision-trace-adapter.ts"
import { listAuditEvents } from "../packages/core/src/api/routes/audit.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let fixture: TestDbRuntimeFixture

beforeEach(() => {
  fixture = createTestDbRuntimeFixture("capability-selection-trace-")
})

afterEach(() => {
  fixture.dispose()
})

function appendInvocation(
  repository: SqliteLlmInvocationReceiptRepository,
  input: {
    invocationId: string
    operationCode: "capability_selection" | "capability_selection_schema_repair"
    at: number
  },
): void {
  repository.append({
    schemaVersion: 1,
    invocationId: input.invocationId,
    phase: "started",
    at: input.at,
    context: {
      runId: "run:selection-trace",
      requestGroupId: "group:selection-trace",
      sessionId: "session:selection-trace",
      stage: "planning",
      operationCode: input.operationCode,
    },
  })
  repository.append({
    schemaVersion: 1,
    invocationId: input.invocationId,
    phase: "completed",
    at: input.at + 10,
    durationMs: 10,
    inputTokens: 10,
    outputTokens: 20,
    context: {
      runId: "run:selection-trace",
      requestGroupId: "group:selection-trace",
      sessionId: "session:selection-trace",
      stage: "planning",
      operationCode: input.operationCode,
    },
  })
}

describe("capability selection decision trace", () => {
  it("accepts only the versioned bounded detail contract", () => {
    expect(
      parseCapabilitySelectionDecisionTraceDetail({
        schemaVersion: CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
        terminalStatus: "rejected",
        attemptCount: 2,
        attemptKinds: ["initial", "repair"],
        validationReasonCodes: ["run_id_required"],
        admissionReasonCodes: ["selected_binding_permission_denied"],
        strategyFingerprints: ["strategy:web:v2"],
      }),
    ).toEqual({
      status: "ready",
      detail: {
        schemaVersion: CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
        terminalStatus: "rejected",
        attemptCount: 2,
        attemptKinds: ["initial", "repair"],
        validationReasonCodes: ["run_id_required"],
        admissionReasonCodes: ["selected_binding_permission_denied"],
        strategyFingerprints: ["strategy:web:v2"],
      },
    })

    expect(
      parseCapabilitySelectionDecisionTraceDetail({
        schemaVersion: CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
        terminalStatus: "rejected",
        attemptCount: 1,
        attemptKinds: ["initial"],
        validationReasonCodes: [],
        admissionReasonCodes: [],
        strategyFingerprints: [],
        rawOutput: "secret model output",
      }),
    ).toEqual({ status: "rejected", reasonCode: "unknown_field" })
    expect(
      parseCapabilitySelectionDecisionTraceDetail({
        schemaVersion: "unknown",
      }),
    ).toEqual({ status: "rejected", reasonCode: "schema_version_unsupported" })
  })

  it("stores invocation references and exposes only redacted versioned detail in Audit", () => {
    const receiptRepository = new SqliteLlmInvocationReceiptRepository()
    appendInvocation(receiptRepository, {
      invocationId: "invocation:selection:initial",
      operationCode: "capability_selection",
      at: 100,
    })
    appendInvocation(receiptRepository, {
      invocationId: "invocation:selection:repair",
      operationCode: "capability_selection_schema_repair",
      at: 120,
    })
    const sink = createSqliteCapabilitySelectionDecisionTraceSink({
      requestGroupId: "group:selection-trace",
      sessionId: "session:selection-trace",
      source: "telegram",
      receiptRepository,
      now: () => 150,
    })

    const stored = sink.record({
      runId: "run:selection-trace",
      decisionReceiptId: "receipt:capability-selection:run:selection-trace",
      reasonCode: "capability_selection_rejected",
      detail: {
        terminalStatus: "rejected",
        attemptCount: 2,
        attemptKinds: ["initial", "repair"],
        validationReasonCodes: ["run_id_required"],
        admissionReasonCodes: ["selected_binding_permission_denied"],
        strategyFingerprints: ["strategy:web:v2"],
      },
    })

    expect(stored).toMatchObject({ status: "stored", traceId: expect.any(String) })
    const row = getDb()
      .prepare(
        `SELECT decision_kind, reason_code, receipt_ids_json, sanitized_detail_json
         FROM decision_traces WHERE run_id = ?`,
      )
      .get("run:selection-trace") as {
        decision_kind: string
        reason_code: string
        receipt_ids_json: string
        sanitized_detail_json: string
      }
    expect(row.decision_kind).toBe("capability_selection")
    expect(row.reason_code).toBe("capability_selection_rejected")
    expect(JSON.parse(row.receipt_ids_json)).toEqual([
      "receipt:capability-selection:run:selection-trace",
      "invocation:selection:initial",
      "invocation:selection:repair",
    ])
    expect(parseCapabilitySelectionDecisionTraceDetail(JSON.parse(row.sanitized_detail_json)))
      .toMatchObject({ status: "ready" })
    expect(row.sanitized_detail_json).not.toMatch(/raw|secret|prompt|output/iu)
    expect(listDecisionTracesForRun("run:selection-trace")).toEqual([
      expect.objectContaining({
        id: stored.status === "stored" ? stored.traceId : "",
        run_id: "run:selection-trace",
        request_group_id: "group:selection-trace",
        channel: "telegram",
        decision_kind: "capability_selection",
      }),
    ])

    const audit = listAuditEvents({ runId: "run:selection-trace", limit: "20" })
    expect(audit.items).toContainEqual(
      expect.objectContaining({
        kind: "decision_trace",
        errorCode: "capability_selection_rejected",
        detail: expect.objectContaining({
          schemaVersion: CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
        }),
      }),
    )

    expect(
      sink.record({
        runId: "run:selection-trace",
        decisionReceiptId: "receipt:secret value",
        reasonCode: "capability_selection_rejected",
        detail: {
          terminalStatus: "rejected",
          attemptCount: 1,
          attemptKinds: ["initial"],
          validationReasonCodes: [],
          admissionReasonCodes: [],
          strategyFingerprints: [],
        },
      }),
    ).toEqual({ status: "failed", reasonCode: "trace_detail_invalid" })
  })
})
