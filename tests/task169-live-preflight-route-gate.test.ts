import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { LiveAcceptanceExecutionSelection } from "../packages/core/src/release/live-acceptance-execution-request.ts"
import {
  type LiveAcceptanceVerifiedExecutionContext,
  createPreflightedLiveAcceptanceExecutor,
} from "../packages/core/src/release/live-acceptance-preflighted-executor.ts"
import {
  admitLiveAcceptanceRuntimeIdentity,
  type LiveAcceptanceRuntimeIdentitySnapshot,
} from "../packages/core/src/release/live-acceptance-runtime-identity.ts"
import type { LiveAcceptanceRuntimeSnapshot } from "../packages/core/src/release/live-acceptance-selection-preflight.ts"

const NOW = Date.parse("2026-07-17T21:00:00.000Z")
const BUNDLE_HASH = `sha256:${"a".repeat(64)}` as const

function runtimeIdentity(
  overrides: Partial<LiveAcceptanceRuntimeIdentitySnapshot> = {},
) {
  return admitLiveAcceptanceRuntimeIdentity({
    buildId: "build:task169",
    bundleSha256: BUNDLE_HASH,
    processStartedAt: "2026-07-17T20:58:00.000Z",
    artifactBuiltAt: "2026-07-17T20:57:00.000Z",
    buildRequired: false,
    restartRequired: false,
    manifestMatchesArtifact: true,
    activeBundleMatchesArtifact: true,
    ...overrides,
  })
}

function selection(): LiveAcceptanceExecutionSelection {
  return {
    extensions: [
      {
        capability: "skill",
        agentId: "agent:release",
        bindingId: "binding:skill",
        catalogId: "skill:release",
        toolName: "release_skill_read",
        readOnly: true,
        params: { probe: "health" },
      },
      {
        capability: "mcp",
        agentId: "agent:release",
        bindingId: "binding:mcp",
        catalogId: "mcp:release",
        toolName: "release_mcp_read",
        readOnly: true,
        params: { probe: "health" },
      },
    ],
    yeonjang: {
      instanceId: "instance:office",
      sessionId: "session:office:1",
      method: "system.info",
      readOnly: true,
    },
  }
}

function snapshot(owner = "agent:release"): LiveAcceptanceRuntimeSnapshot {
  return {
    capturedAt: NOW,
    extensions: [
      {
        bindingId: "binding:skill",
        agentId: owner,
        capabilityKind: "skill",
        catalogId: "skill:release",
        bindingStatus: "enabled",
        secretScopeId: null,
        enabledToolNamesJson: '["release_skill_read"]',
        disabledToolNamesJson: "null",
      },
      {
        bindingId: "binding:mcp",
        agentId: "agent:release",
        capabilityKind: "mcp_server",
        catalogId: "mcp:release",
        bindingStatus: "enabled",
        secretScopeId: "secret:release:mcp",
        enabledToolNamesJson: '["release_mcp_read"]',
        disabledToolNamesJson: "null",
      },
    ],
    catalogs: [
      {
        capability: "skill",
        catalogId: "skill:release",
        status: "enabled",
        risk: "safe",
        toolNamesJson: '["release_skill_read"]',
      },
      {
        capability: "mcp",
        catalogId: "mcp:release",
        status: "enabled",
        risk: "safe",
        toolNamesJson: '["release_mcp_read"]',
      },
    ],
    tools: [
      {
        name: "release_skill_read",
        riskLevel: "safe",
        requiresApproval: false,
        hasSideEffect: false,
      },
      {
        name: "release_mcp_read",
        riskLevel: "safe",
        requiresApproval: false,
        hasSideEffect: false,
      },
    ],
    yeonjangInstances: [
      {
        instanceId: "instance:office",
        displayName: "Office",
        state: "online",
        trustState: "trusted",
        scopeAccess: "allowed",
        runnableTarget: true,
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        session: {
          sessionId: "session:office:1",
          state: "connected",
          lastSeenAt: NOW - 1_000,
          endedAt: null,
          stale: false,
        },
      },
    ],
  }
}

function routeInput(signal = new AbortController().signal) {
  return {
    candidate: { appVersion: "0.2.16", gitTag: "v0.2.16", gitCommit: "abc123" },
    approval: {
      decision: "approved" as const,
      authorizationStatus: "active" as const,
      authorizationId: "authorization:169",
      auditEventId: "audit:authorization:169",
      principalType: "authenticated_user" as const,
      principalId: "operator:169",
      authenticationId: "bearer_token",
      roles: ["release_administrator"],
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      redactionStatus: "verified" as const,
    },
    selection: selection(),
    requestedKeyId: `sha256:${"d".repeat(64)}`,
    signal,
  }
}

describe("Task 169 preflighted live route execution gate", () => {
  it("keeps infrastructure and environment behind injected ports", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/release/live-acceptance-preflighted-executor.ts"),
      "utf8",
    )

    expect(source).not.toContain("process.env")
    expect(source).not.toMatch(
      /from ["'][^"']*(?:db|dispatcher|registry|provider|fastify)[^"']*["']/u,
    )
    expect(source).not.toContain("getProvider(")
  })

  it("captures once and passes only immutable exact runner selections downstream", async () => {
    const signal = new AbortController().signal
    const captureSnapshot = vi.fn(() => snapshot())
    const executeVerified = vi.fn(async (_context: LiveAcceptanceVerifiedExecutionContext) => ({
      status: "blocked" as const,
      blockers: [{ capability: "channels", reasonCode: "fixture" }],
      events: [{ state: "initialized" as const }, { state: "blocked" as const }],
    }))
    const execute = createPreflightedLiveAcceptanceExecutor({
      now: () => NOW,
      maxYeonjangAgeMs: 30_000,
      inspectRuntimeIdentity: () => runtimeIdentity(),
      captureSnapshot,
      executeVerified,
    })

    await execute(routeInput(signal))

    expect(captureSnapshot).toHaveBeenCalledOnce()
    expect(captureSnapshot).toHaveBeenCalledWith(NOW)
    expect(executeVerified).toHaveBeenCalledOnce()
    const context = executeVerified.mock.calls[0]?.[0]
    expect(context?.signal).toBe(signal)
    expect(context?.runtimeIdentity).toEqual({
      buildId: "build:task169",
      bundleSha256: BUNDLE_HASH,
      processStartedAt: "2026-07-17T20:58:00.000Z",
      artifactBuiltAt: "2026-07-17T20:57:00.000Z",
      buildRequired: false,
      restartRequired: false,
    })
    expect(context?.preflight.extensions.map((item) => item.scenario.expectedToolName)).toEqual([
      "release_skill_read",
      "release_mcp_read",
    ])
    expect(context?.preflight.yeonjang.scenario.expectedSessionId).toBe("session:office:1")
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context?.preflight.extensions)).toBe(true)
  })

  it.each([
    [{ buildRequired: true }, "live_acceptance_runtime_build_required"],
    [{ restartRequired: true }, "live_acceptance_runtime_restart_required"],
    [
      { activeBundleMatchesArtifact: false },
      "live_acceptance_runtime_bundle_identity_mismatch",
    ],
  ] as const)("blocks stale runtime before snapshot or downstream execution", async (
    overrides,
    reasonCode,
  ) => {
    const captureSnapshot = vi.fn(() => snapshot())
    const executeVerified = vi.fn()
    const execute = createPreflightedLiveAcceptanceExecutor({
      now: () => NOW,
      maxYeonjangAgeMs: 30_000,
      inspectRuntimeIdentity: () => runtimeIdentity(overrides),
      captureSnapshot,
      executeVerified,
    })

    await expect(execute(routeInput())).resolves.toEqual({
      status: "blocked",
      blockers: [{ capability: "collection", reasonCode }],
      events: [{ state: "initialized" }, { state: "blocked" }],
    })
    expect(captureSnapshot).not.toHaveBeenCalled()
    expect(executeVerified).not.toHaveBeenCalled()
  })

  it("blocks an exact preflight mismatch before downstream execution", async () => {
    const executeVerified = vi.fn()
    const execute = createPreflightedLiveAcceptanceExecutor({
      now: () => NOW,
      maxYeonjangAgeMs: 30_000,
      inspectRuntimeIdentity: () => runtimeIdentity(),
      captureSnapshot: () => snapshot("agent:other"),
      executeVerified,
    })

    await expect(execute(routeInput())).resolves.toEqual({
      status: "blocked",
      blockers: [{ capability: "collection", reasonCode: "live_preflight_binding_owner_mismatch" }],
      events: [{ state: "initialized" }, { state: "validating" }, { state: "blocked" }],
    })
    expect(executeVerified).not.toHaveBeenCalled()
  })

  it("bounds capture failures and cancellation without running downstream", async () => {
    const executeVerified = vi.fn()
    const captureFailure = createPreflightedLiveAcceptanceExecutor({
      now: () => NOW,
      maxYeonjangAgeMs: 30_000,
      inspectRuntimeIdentity: () => runtimeIdentity(),
      captureSnapshot: () => {
        throw new Error("private runtime detail")
      },
      executeVerified,
    })
    const controller = new AbortController()
    controller.abort()
    const cancelled = createPreflightedLiveAcceptanceExecutor({
      now: () => NOW,
      maxYeonjangAgeMs: 30_000,
      inspectRuntimeIdentity: () => runtimeIdentity(),
      captureSnapshot: vi.fn(() => snapshot()),
      executeVerified,
    })

    const failed = await captureFailure(routeInput())
    expect(failed).toEqual({
      status: "blocked",
      blockers: [{ capability: "collection", reasonCode: "live_preflight_capture_failed" }],
      events: [{ state: "initialized" }, { state: "blocked" }],
    })
    expect(JSON.stringify(failed)).not.toContain("private runtime detail")
    await expect(cancelled(routeInput(controller.signal))).resolves.toEqual({
      status: "cancelled",
      blockers: [{ capability: "collection", reasonCode: "live_collection_cancelled" }],
      events: [{ state: "initialized" }, { state: "cancelled" }],
    })
    expect(executeVerified).not.toHaveBeenCalled()
  })

  it("propagates an in-flight abort and prevents downstream publication", async () => {
    const controller = new AbortController()
    const publish = vi.fn()
    const executeVerified = vi.fn(async (context: LiveAcceptanceVerifiedExecutionContext) => {
      await new Promise<void>((resolve) =>
        context.signal.addEventListener("abort", () => resolve(), { once: true }),
      )
      if (!context.signal.aborted) publish()
      return {
        status: "cancelled" as const,
        blockers: [{ capability: "collection" as const, reasonCode: "live_collection_cancelled" }],
        events: [{ state: "initialized" as const }, { state: "cancelled" as const }],
      }
    })
    const execute = createPreflightedLiveAcceptanceExecutor({
      now: () => NOW,
      maxYeonjangAgeMs: 30_000,
      inspectRuntimeIdentity: () => runtimeIdentity(),
      captureSnapshot: () => snapshot(),
      executeVerified,
    })

    const pending = execute(routeInput(controller.signal))
    await vi.waitFor(() => expect(executeVerified).toHaveBeenCalledOnce())
    controller.abort()

    await expect(pending).resolves.toMatchObject({ status: "cancelled" })
    expect(publish).not.toHaveBeenCalled()
  })
})
