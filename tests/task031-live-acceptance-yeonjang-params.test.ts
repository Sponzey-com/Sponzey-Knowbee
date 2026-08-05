import { describe, expect, it, vi } from "vitest"
import {
  type LiveAcceptanceExecutionRequest,
  validateLiveAcceptanceExecutionRequest,
} from "../packages/core/src/release/live-acceptance-execution-request.ts"
import {
  type LiveAcceptanceRuntimeSnapshot,
  resolveLiveAcceptanceExecutionSelections,
} from "../packages/core/src/release/live-acceptance-selection-preflight.ts"
import { createYeonjangLiveTransportAdapter } from "../packages/core/src/runs/yeonjang-live-transport-adapter.ts"
import type { YeonjangLiveSmokeSelection } from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const NOW = Date.parse("2026-07-21T12:00:00.000Z")
const KEY_ID = `sha256:${"f".repeat(64)}` as const

function request(): LiveAcceptanceExecutionRequest {
  return {
    kind: "knowbee.release.live_acceptance_execution_request",
    schemaVersion: 2,
    candidate: { appVersion: "0.2.16", gitTag: "v0.2.16", gitCommit: "abc123" },
    authorization: {
      authorizationId: "authorization:task031",
      auditEventId: "audit:authorization:task031",
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
    },
    selection: {
      extensions: [
        {
          capability: "skill",
          agentId: "agent:task031",
          bindingId: "binding:task031:skill",
          catalogId: "skill:task031",
          toolName: "task031_skill_read",
          readOnly: true,
          params: {},
        },
        {
          capability: "mcp",
          agentId: "agent:task031",
          bindingId: "binding:task031:mcp",
          catalogId: "task031",
          toolName: "mcp__task031__read",
          readOnly: true,
          params: {},
        },
      ],
      yeonjang: {
        instanceId: "instance:task031",
        sessionId: "session:task031",
        method: "file.list",
        params: {
          path: "/Users/example/Documents",
          limit: 25,
          includeHidden: false,
        },
        readOnly: true,
      },
    },
    requestedKeyId: KEY_ID,
  }
}

function snapshot(): LiveAcceptanceRuntimeSnapshot {
  return {
    capturedAt: NOW,
    extensions: [
      {
        bindingId: "binding:task031:skill",
        agentId: "agent:task031",
        capabilityKind: "skill",
        catalogId: "skill:task031",
        bindingStatus: "enabled",
        secretScopeId: null,
        enabledToolNamesJson: '["task031_skill_read"]',
        disabledToolNamesJson: "[]",
      },
      {
        bindingId: "binding:task031:mcp",
        agentId: "agent:task031",
        capabilityKind: "mcp_server",
        catalogId: "task031",
        bindingStatus: "enabled",
        secretScopeId: "secret:task031:mcp",
        enabledToolNamesJson: '["mcp__task031__read"]',
        disabledToolNamesJson: "[]",
      },
    ],
    catalogs: [
      {
        capability: "skill",
        catalogId: "skill:task031",
        status: "enabled",
        risk: "safe",
        toolNamesJson: '["task031_skill_read"]',
      },
      {
        capability: "mcp",
        catalogId: "task031",
        status: "enabled",
        risk: "safe",
        toolNamesJson: '["mcp__task031__read"]',
      },
    ],
    tools: [
      { name: "task031_skill_read", riskLevel: "safe", requiresApproval: false, hasSideEffect: false },
      { name: "mcp__task031__read", riskLevel: "safe", requiresApproval: false, hasSideEffect: false },
    ],
    yeonjangInstances: [
      {
        instanceId: "instance:task031",
        displayName: "Task 031 Mac",
        state: "online",
        trustState: "trusted",
        scopeAccess: "allowed",
        runnableTarget: true,
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        session: {
          sessionId: "session:task031",
          state: "connected",
          lastSeenAt: NOW - 1_000,
          endedAt: null,
          stale: false,
        },
      },
    ],
  }
}

describe("Task 031 live acceptance Yeonjang params", () => {
  it("validates and preserves read-only Yeonjang method params", () => {
    const result = validateLiveAcceptanceExecutionRequest(request(), NOW)

    expect(result.status).toBe("verified")
    if (result.status !== "verified") return
    expect(result.request.selection.yeonjang.method).toBe("file.list")
    expect(result.request.selection.yeonjang.params).toEqual({
      path: "/Users/example/Documents",
      limit: 25,
      includeHidden: false,
    })
  })

  it("copies Yeonjang params into the verified smoke scenario", () => {
    const validated = validateLiveAcceptanceExecutionRequest(request(), NOW)
    expect(validated.status).toBe("verified")
    if (validated.status !== "verified") return

    const result = resolveLiveAcceptanceExecutionSelections({
      selection: validated.request.selection,
      snapshot: snapshot(),
      now: NOW,
      maxYeonjangAgeMs: 10_000,
    })

    expect(result.status).toBe("verified")
    if (result.status !== "verified") return
    expect(result.yeonjang.scenario.expectedMethod).toBe("file.list")
    expect(result.yeonjang.scenario.params).toEqual({
      path: "/Users/example/Documents",
      limit: 25,
      includeHidden: false,
    })
  })

  it("passes scenario params to the Yeonjang transport invoke port", async () => {
    const invoke = vi.fn(async () => ({ entries: [] }))
    const adapter = createYeonjangLiveTransportAdapter({
      invoke,
      timeoutMs: 5_000,
      createCommandId: () => "command:task031",
      createAuditCorrelationId: () => "audit-correlation:task031",
      recordAuditEvent: () => "audit:task031",
    })
    const selection: YeonjangLiveSmokeSelection = {
      scenario: {
        id: "task031-file-list",
        expectedInstanceId: "instance:task031",
        expectedSessionId: "session:task031",
        expectedMethod: "file.list",
        params: { path: "/Users/example/Documents", limit: 25 },
        readOnly: true,
      },
      instance: {
        instanceId: "instance:task031",
        publicName: "Task 031 Mac",
        sessionId: "session:task031",
        status: "connected",
        observedAt: NOW,
        duplicateActiveIdentityCount: 0,
        trustState: "trusted",
        runnableTarget: true,
      },
    }

    await adapter({ runId: "run:task031", selection, signal: new AbortController().signal })

    expect(invoke).toHaveBeenCalledWith(
      "file.list",
      { path: "/Users/example/Documents", limit: 25 },
      expect.objectContaining({ extensionId: "instance:task031" }),
    )
  })
})

