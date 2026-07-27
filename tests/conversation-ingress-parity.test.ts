import { describe, expect, it } from "vitest"
import {
  buildWebUiTransportIdentity,
} from "../packages/core/src/api/routes/runs.ts"
import {
  buildPromptContextBlockPlan,
} from "../packages/core/src/orchestration/prompt-bundle.ts"
import {
  createInboundMessageRecord,
} from "../packages/core/src/runs/request-isolation.ts"

function record(
  source: "webui" | "telegram",
  sessionId: string,
  channelEventId: string,
  externalThreadId: string,
) {
  return createInboundMessageRecord({
    source,
    sessionId,
    channelEventId,
    externalChatId: sessionId,
    externalThreadId,
    externalMessageId: channelEventId,
    userId: `${source}:user`,
    receivedAt: 1,
  })
}

describe("Telegram/WebUI conversation ingress parity", () => {
  it("creates isolated root identities for direct requests on both channels", () => {
    const webui = record("webui", "webui:session:a", "webui:req:1", "webui:session:a")
    const telegram = record("telegram", "telegram:chat:a", "telegram:update:1", "topic:7")

    for (const ingress of [webui, telegram]) {
      expect(ingress.rootIsolation).toBe("new_root_by_default")
      expect(ingress.ingressId).toBe(`ingress:${ingress.messageKey}`)
      expect(ingress.channelEventId).toBeTruthy()
    }
    expect(webui.messageKey).not.toBe(telegram.messageKey)
    expect(webui.sessionId).not.toBe(telegram.sessionId)
  })

  it("keeps a WebUI client request identity stable across duplicate server submissions", () => {
    const first = buildWebUiTransportIdentity({
      runId: "server-run-a",
      sessionId: "webui:session:a",
      clientRequestId: "webui:request:stable",
    })
    const duplicate = buildWebUiTransportIdentity({
      runId: "server-run-b",
      sessionId: "webui:session:a",
      clientRequestId: "webui:request:stable",
    })

    const firstIngress = createInboundMessageRecord({ ...first, receivedAt: 1 })
    const duplicateIngress = createInboundMessageRecord({ ...duplicate, receivedAt: 2 })
    expect(firstIngress.ingressId).toBe(duplicateIngress.ingressId)
    expect(firstIngress.messageKey).toBe(duplicateIngress.messageKey)
  })

  it("reuses request-group context only for explicit continuation and keeps latest input first", () => {
    const root = buildPromptContextBlockPlan({
      mode: "root",
      hasLatestUserMessage: true,
      hasRequestGroupContext: true,
    })
    const continuation = buildPromptContextBlockPlan({
      mode: "explicit_continuation",
      hasLatestUserMessage: true,
      hasRequestGroupContext: true,
    })

    const rootContext = root.includedContextBlocks.find(
      (block) => block.blockId === "request_group_context",
    )
    const continuationContext = continuation.includedContextBlocks.find(
      (block) => block.blockId === "request_group_context",
    )
    expect(rootContext).toMatchObject({
      included: false,
      reason: "excluded_without_explicit_continuation",
    })
    expect(continuationContext).toMatchObject({
      included: true,
      reason: "explicit_continuation_only",
    })
    expect(continuation.includedContextBlocks[0]).toMatchObject({
      blockId: "latest_user_message",
      included: true,
      reason: "current_request_input",
    })
  })
})
