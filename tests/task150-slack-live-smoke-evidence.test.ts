import { describe, expect, it } from "vitest"
import type { SlackLiveSmokeTarget } from "../packages/core/src/api/server-runtime-context.ts"
import { createSlackLiveSmokeEvidenceReader } from "../packages/core/src/api/slack-live-smoke-evidence.ts"
import type { DbChannelMessageRef, DbMessageLedgerEvent } from "../packages/core/src/db/index.ts"

const RUN = { id: "run-150", requestGroupId: "run-150" }
const TARGET: SlackLiveSmokeTarget = {
  channelId: "C150TARGET",
  userId: "U150ACTOR",
  threadTs: "1752740000.000150",
}

function ledger(overrides: Partial<DbMessageLedgerEvent> = {}): DbMessageLedgerEvent {
  return {
    id: "ledger-150",
    run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    session_key: "session-150",
    thread_key: "slack:C150TARGET:1752740000.000150",
    channel: "slack",
    event_kind: "text_delivered",
    delivery_key: "delivery-150",
    idempotency_key: "idempotency-150",
    status: "delivered",
    summary: "private text",
    detail_json: JSON.stringify({
      deliveryReceipts: [{ provider: "slack", status: "sent", messageId: "1752740001.000150" }],
    }),
    created_at: 2,
    ...overrides,
  }
}

function ref(overrides: Partial<DbChannelMessageRef> = {}): DbChannelMessageRef {
  return {
    id: "ref-150",
    source: "slack",
    session_id: "session-150",
    root_run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    external_chat_id: TARGET.channelId,
    external_thread_id: TARGET.threadTs ?? null,
    external_message_id: "1752740001.000150",
    role: "assistant",
    created_at: 2,
    ...overrides,
  }
}

function finalDelivery(overrides: Partial<DbMessageLedgerEvent> = {}): DbMessageLedgerEvent {
  return ledger({
    id: "final-150",
    event_kind: "final_answer_delivered",
    detail_json: JSON.stringify({ providerEvidence: "confirmed" }),
    ...overrides,
  })
}

describe("Task 150 Slack live smoke evidence", () => {
  it("requires provider receipt, same target ref, and final delivery", () => {
    const read = createSlackLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [ledger(), finalDelivery()],
      listChannelMessageRefsForRun: () => [ref()],
    })
    expect(read(RUN, TARGET)).toEqual({
      providerDeliveryReceipted: true,
      targetMatched: true,
      userReportDelivered: true,
    })
  })

  it.each([
    [[ledger({ event_kind: "fast_receipt_sent" })], [ref()]],
    [[ledger({ detail_json: null }), finalDelivery()], [ref()]],
    [[ledger(), finalDelivery()], [ref({ external_thread_id: "other-thread" })]],
    [
      [ledger({ request_group_id: "other" }), finalDelivery({ request_group_id: "other" })],
      [ref()],
    ],
  ])("fails closed for incomplete or cross-scope evidence", (events, refs) => {
    const read = createSlackLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => events,
      listChannelMessageRefsForRun: () => refs,
    })
    expect(read(RUN, TARGET)).not.toEqual({
      providerDeliveryReceipted: true,
      targetMatched: true,
      userReportDelivered: true,
    })
  })

  it("projects no raw target, text, or provider payload", () => {
    const read = createSlackLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [ledger(), finalDelivery()],
      listChannelMessageRefsForRun: () => [ref()],
    })
    expect(JSON.stringify(read(RUN, TARGET))).not.toMatch(/C150|U150|175274|private/u)
  })
})
