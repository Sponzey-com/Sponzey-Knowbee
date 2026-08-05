import { describe, expect, it } from "vitest"
import { createTelegramLiveSmokeEvidenceReader } from "../packages/core/src/api/telegram-live-smoke-evidence.ts"
import type {
  DbChannelMessageRef,
  DbDecisionTrace,
  DbMessageLedgerEvent,
} from "../packages/core/src/db/index.ts"

const RUN = { id: "run-148", requestGroupId: "run-148" }
const TARGET = { chatId: -100148, userId: 148, threadId: 7 }

function ledgerEvent(overrides: Partial<DbMessageLedgerEvent> = {}): DbMessageLedgerEvent {
  return {
    id: "ledger-148",
    run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    session_key: "telegram:-100148:7",
    thread_key: "telegram:-100148:7",
    channel: "telegram",
    event_kind: "text_delivered",
    delivery_key: "delivery-148",
    idempotency_key: "idempotency-148",
    status: "delivered",
    summary: "private response text",
    detail_json: JSON.stringify({
      deliveryReceipts: [
        {
          status: "sent",
          provider: "telegram",
          connectionId: "telegram:primary",
          messageId: "9001",
          threadId: "7",
          idempotencyKey: "provider-148",
        },
      ],
    }),
    created_at: 2,
    ...overrides,
  }
}

function messageRef(overrides: Partial<DbChannelMessageRef> = {}): DbChannelMessageRef {
  return {
    id: "ref-148",
    source: "telegram",
    session_id: "session-148",
    root_run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    external_chat_id: String(TARGET.chatId),
    external_thread_id: String(TARGET.threadId),
    external_message_id: "9001",
    role: "assistant",
    created_at: 2,
    ...overrides,
  }
}

function finalDelivery(overrides: Partial<DbMessageLedgerEvent> = {}): DbMessageLedgerEvent {
  return ledgerEvent({
    id: "final-148",
    event_kind: "final_answer_delivered",
    detail_json: JSON.stringify({ providerEvidence: "confirmed" }),
    ...overrides,
  })
}

function providerReceipt(overrides: Partial<DbMessageLedgerEvent> = {}): DbMessageLedgerEvent {
  return ledgerEvent({
    id: "receipt-148",
    event_kind: "delivery_receipted",
    status: "sent",
    detail_json: JSON.stringify({
      receipts: [
        {
          status: "sent",
          provider: "telegram",
          messageId: "9001",
        },
      ],
    }),
    ...overrides,
  })
}

function capabilitySelectionTrace(
  overrides: Partial<DbDecisionTrace> = {},
): DbDecisionTrace {
  return {
    id: "decision-trace-148",
    run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    session_id: "session-148",
    source: "telegram",
    channel: "telegram",
    decision_kind: "capability_selection",
    reason_code: "capability_selection_allowed",
    input_contract_ids_json: null,
    receipt_ids_json: JSON.stringify(["receipt:capability-selection:run-148"]),
    sanitized_detail_json: JSON.stringify({
      schemaVersion: "knowbee.capability-selection-trace.v1",
      terminalStatus: "allowed",
      attemptCount: 1,
      attemptKinds: ["initial"],
      validationReasonCodes: [],
      admissionReasonCodes: [],
      strategyFingerprints: ["strategy:web:current:v2"],
    }),
    created_at: 1,
    ...overrides,
  }
}

describe("Task 148 Telegram live smoke evidence", () => {
  it("requires final delivery, a provider receipt, and a same-target message ref", () => {
    const read = createTelegramLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [ledgerEvent(), finalDelivery()],
      listChannelMessageRefsForRun: () => [messageRef()],
    })

    expect(read(RUN, TARGET)).toMatchObject({
      providerDeliveryReceipted: true,
      targetMatched: true,
      userReportDelivered: true,
      deliveryReceiptRef: "final-148",
    })
  })

  it("accepts the canonical delivery_receipted ledger shape", () => {
    const read = createTelegramLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [providerReceipt(), finalDelivery()],
      listChannelMessageRefsForRun: () => [messageRef()],
    })

    expect(read(RUN, TARGET)).toMatchObject({
      providerDeliveryReceipted: true,
      targetMatched: true,
      userReportDelivered: true,
      deliveryReceiptRef: "final-148",
    })
  })

  it("projects only a valid same-run versioned capability selection trace reference", () => {
    const read = createTelegramLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [providerReceipt(), finalDelivery()],
      listChannelMessageRefsForRun: () => [messageRef()],
      listDecisionTracesForRun: () => [capabilitySelectionTrace()],
    })

    expect(read(RUN, TARGET)).toMatchObject({
      capabilitySelectionDecisionTraceId: "decision-trace-148",
    })

    const invalid = createTelegramLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [providerReceipt(), finalDelivery()],
      listChannelMessageRefsForRun: () => [messageRef()],
      listDecisionTracesForRun: () => [
        capabilitySelectionTrace({
          request_group_id: "other-group",
          sanitized_detail_json: JSON.stringify({
            schemaVersion: "unknown",
            rawOutput: "secret",
          }),
        }),
      ],
    })
    expect(invalid(RUN, TARGET)).not.toHaveProperty(
      "capabilitySelectionDecisionTraceId",
    )
    expect(JSON.stringify(invalid(RUN, TARGET))).not.toContain("secret")
  })

  it.each([
    {
      name: "acknowledgement only",
      ledger: [ledgerEvent({ event_kind: "fast_receipt_sent", status: "sent" })],
      refs: [messageRef()],
    },
    {
      name: "sent text without structured provider receipt",
      ledger: [ledgerEvent({ detail_json: null }), finalDelivery()],
      refs: [messageRef()],
    },
    {
      name: "cross-target message ref",
      ledger: [ledgerEvent(), finalDelivery()],
      refs: [messageRef({ external_chat_id: "-100999" })],
    },
    {
      name: "cross-group events",
      ledger: [
        ledgerEvent({ request_group_id: "other-group" }),
        finalDelivery({ request_group_id: "other-group" }),
      ],
      refs: [messageRef()],
    },
  ])("fails closed for $name", ({ ledger, refs }) => {
    const read = createTelegramLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => ledger,
      listChannelMessageRefsForRun: () => refs,
    })
    const result = read(RUN, TARGET)
    expect(
      result.providerDeliveryReceipted &&
        result.targetMatched &&
        result.userReportDelivered,
    ).toBe(false)
  })

  it("never projects raw ledger text, chat IDs, or provider payload", () => {
    const read = createTelegramLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [
        ledgerEvent({ summary: "Bearer secret at /Users/private" }),
        finalDelivery({ detail_json: '{"providerEvidence":"confirmed","raw":"secret"}' }),
      ],
      listChannelMessageRefsForRun: () => [messageRef()],
    })
    expect(JSON.stringify(read(RUN, TARGET))).not.toMatch(/Bearer|secret|\/Users\/|-100148|9001/u)
  })
})
