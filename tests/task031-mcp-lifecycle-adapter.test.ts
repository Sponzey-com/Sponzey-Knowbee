import { beforeEach, describe, expect, it, vi } from "vitest"
import { localAdapter } from "../packages/webui/src/api/adapters/local.js"

describe("task031 MCP lifecycle WebUI adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", { getItem: () => null })
  })
  it("uses dedicated status and delete endpoints and forwards cancellation", async () => {
    const response = { ok: true, json: async () => ({ state: "active" }) }
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal("fetch", fetchMock)
    const signal = new AbortController().signal
    const envelope = {
      scope: "capability:write" as const,
      mutationId: "m1",
      targetRevision: 2,
      purpose: "mcp_disable" as const,
      issuedAt: 1,
      nonce: "n1",
    }
    await localAdapter.updateMcpStatus("mcp-public", { envelope, enabled: false }, signal)
    await localAdapter.deleteMcp(
      "mcp-public",
      { envelope: { ...envelope, purpose: "mcp_delete" } },
      signal,
    )
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/capabilities/mcp/mcp-public/status",
      { method: "PATCH", signal },
    ])
    expect(fetchMock.mock.calls[1]).toMatchObject([
      "/api/capabilities/mcp/mcp-public",
      { method: "DELETE", signal },
    ])
  })
})
