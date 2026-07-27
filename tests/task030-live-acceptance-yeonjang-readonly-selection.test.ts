import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type LiveAcceptanceExecutionRequest,
  validateLiveAcceptanceExecutionRequest,
} from "../packages/core/src/release/live-acceptance-execution-request.ts"
import {
  type LiveAcceptanceRuntimeSnapshot,
  resolveLiveAcceptanceExecutionSelections,
} from "../packages/core/src/release/live-acceptance-selection-preflight.ts"

const NOW = Date.parse("2026-07-21T10:00:00.000Z")
const KEY_ID = `sha256:${"e".repeat(64)}` as const

function request(method: string): LiveAcceptanceExecutionRequest {
  return {
    kind: "knowbee.release.live_acceptance_execution_request",
    schemaVersion: 2,
    candidate: { appVersion: "0.2.16", gitTag: "v0.2.16", gitCommit: "abc123" },
    authorization: {
      authorizationId: "authorization:task030",
      auditEventId: "audit:authorization:task030",
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
    },
    selection: {
      extensions: [
        {
          capability: "skill",
          agentId: "agent:task030",
          bindingId: "binding:task030:skill",
          catalogId: "skill:task030",
          toolName: "task030_skill_read",
          readOnly: true,
          params: {},
        },
        {
          capability: "mcp",
          agentId: "agent:task030",
          bindingId: "binding:task030:mcp",
          catalogId: "task030",
          toolName: "mcp__task030__read",
          readOnly: true,
          params: {},
        },
      ],
      yeonjang: {
        instanceId: "instance:task030",
        sessionId: "session:task030",
        method: method as "system.info",
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
        bindingId: "binding:task030:skill",
        agentId: "agent:task030",
        capabilityKind: "skill",
        catalogId: "skill:task030",
        bindingStatus: "enabled",
        secretScopeId: null,
        enabledToolNamesJson: '["task030_skill_read"]',
        disabledToolNamesJson: "[]",
      },
      {
        bindingId: "binding:task030:mcp",
        agentId: "agent:task030",
        capabilityKind: "mcp_server",
        catalogId: "task030",
        bindingStatus: "enabled",
        secretScopeId: "secret:task030:mcp",
        enabledToolNamesJson: '["mcp__task030__read"]',
        disabledToolNamesJson: "[]",
      },
    ],
    catalogs: [
      {
        capability: "skill",
        catalogId: "skill:task030",
        status: "enabled",
        risk: "safe",
        toolNamesJson: '["task030_skill_read"]',
      },
      {
        capability: "mcp",
        catalogId: "task030",
        status: "enabled",
        risk: "safe",
        toolNamesJson: '["mcp__task030__read"]',
      },
    ],
    tools: [
      {
        name: "task030_skill_read",
        riskLevel: "safe",
        requiresApproval: false,
        hasSideEffect: false,
      },
      {
        name: "mcp__task030__read",
        riskLevel: "safe",
        requiresApproval: false,
        hasSideEffect: false,
      },
    ],
    yeonjangInstances: [
      {
        instanceId: "instance:task030",
        displayName: "Task 030 Mac",
        state: "online",
        trustState: "trusted",
        scopeAccess: "allowed",
        runnableTarget: true,
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        session: {
          sessionId: "session:task030",
          state: "connected",
          lastSeenAt: NOW - 1_000,
          endedAt: null,
          stale: false,
        },
      },
    ],
  }
}

describe("Task 030 live acceptance Yeonjang read-only selection", () => {
  it("verifies and preserves camera.list in the execution request", () => {
    const result = validateLiveAcceptanceExecutionRequest(request("camera.list"), NOW)

    expect(result.status).toBe("verified")
    if (result.status !== "verified") throw new Error(result.reasonCode)
    expect(result.request.selection.yeonjang.method).toBe("camera.list")
  })

  it("passes camera.list through exact selection preflight", () => {
    const verified = validateLiveAcceptanceExecutionRequest(request("camera.list"), NOW)
    if (verified.status !== "verified") throw new Error(verified.reasonCode)

    const result = resolveLiveAcceptanceExecutionSelections({
      selection: verified.request.selection,
      snapshot: snapshot(),
      now: NOW,
      maxYeonjangAgeMs: 5_000,
    })

    expect(result.status).toBe("verified")
    if (result.status !== "verified") throw new Error(result.reasonCode)
    expect(result.yeonjang.scenario.expectedMethod).toBe("camera.list")
    expect(result.yeonjang.scenario.id).toBe("live-acceptance:yeonjang-camera-list")
  })

  it("rejects side-effect Yeonjang methods in the execution request", () => {
    expect(validateLiveAcceptanceExecutionRequest(request("system.exec"), NOW)).toEqual({
      status: "rejected",
      reasonCode: "live_acceptance_request_selection_invalid",
    })
  })

  it("uses the shared read-only method allowlist instead of system.info-only checks", () => {
    const requestSource = readFileSync(
      "packages/core/src/release/live-acceptance-execution-request.ts",
      "utf8",
    )
    const preflightSource = readFileSync(
      "packages/core/src/release/live-acceptance-selection-preflight.ts",
      "utf8",
    )

    expect(requestSource).toContain("isYeonjangLiveSmokeReadOnlyMethod")
    expect(preflightSource).toContain("isYeonjangLiveSmokeReadOnlyMethod")
    expect(requestSource).not.toContain('yeonjang.method !== "system.info"')
    expect(preflightSource).not.toContain('input.selection.yeonjang.method !== "system.info"')
  })
})
