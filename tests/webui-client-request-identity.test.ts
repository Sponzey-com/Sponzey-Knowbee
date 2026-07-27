import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildWebUiTransportIdentity,
  resolveWebUiClientRequestId,
} from "../packages/core/src/api/routes/runs.ts"

describe("WebUI client request identity", () => {
  it("uses a valid client request ID independently from the server run ID", () => {
    expect(resolveWebUiClientRequestId(" webui:request-123 ")).toEqual({
      ok: true,
      clientRequestId: "webui:request-123",
    })
    expect(
      buildWebUiTransportIdentity({
        runId: "server-run-a",
        sessionId: "session-a",
        clientRequestId: "webui:request-123",
      }),
    ).toEqual({
      source: "webui",
      channelEventId: "webui:request-123",
      externalChatId: "session-a",
      externalThreadId: "session-a",
      externalMessageId: "webui:request-123",
    })
    expect(
      buildWebUiTransportIdentity({
        runId: "server-run-b",
        sessionId: "session-a",
        clientRequestId: "webui:request-123",
      }),
    ).toEqual(
      expect.objectContaining({
        channelEventId: "webui:request-123",
        externalMessageId: "webui:request-123",
      }),
    )
  })

  it("rejects malformed IDs and keeps absent IDs backward compatible", () => {
    expect(resolveWebUiClientRequestId(undefined)).toEqual({
      ok: true,
      clientRequestId: undefined,
    })
    expect(resolveWebUiClientRequestId("contains spaces")).toEqual({
      ok: false,
      reasonCode: "invalid_client_request_id",
    })
    expect(resolveWebUiClientRequestId("x".repeat(129))).toEqual({
      ok: false,
      reasonCode: "invalid_client_request_id",
    })
  })

  it("wires both POST routes and the WebUI client to clientRequestId", () => {
    const runsSource = readFileSync(
      new URL("../packages/core/src/api/routes/runs.ts", import.meta.url),
      "utf8",
    )
    const agentSource = readFileSync(
      new URL("../packages/core/src/api/routes/agent.ts", import.meta.url),
      "utf8",
    )
    const clientSource = readFileSync(
      new URL("../packages/webui/src/api/client.ts", import.meta.url),
      "utf8",
    )

    expect(runsSource).toContain("clientRequestId?: string")
    expect(runsSource).toContain("resolveWebUiClientRequestId(req.body.clientRequestId)")
    expect(agentSource).toContain("resolveWebUiClientRequestId(req.body.clientRequestId)")
    expect(clientSource).toContain("clientRequestId = crypto.randomUUID()")
    expect(clientSource).toContain("clientRequestId,")
  })
})
