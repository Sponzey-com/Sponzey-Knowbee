import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  closeDb,
  listAgentCapabilityBindings,
  listMcpServerCatalogEntries,
  listSkillCatalogEntries,
  upsertAgentCapabilityBinding,
  upsertMcpServerCatalogEntry,
  upsertSkillCatalogEntry,
} from "../packages/core/src/db/index.js"
import type { LiveAcceptanceExecutionSelection } from "../packages/core/src/release/live-acceptance-execution-request.ts"
import { captureLiveAcceptanceRuntimeSnapshot } from "../packages/core/src/release/live-acceptance-runtime-snapshot-adapter.ts"
import {
  type LiveAcceptanceRuntimeSnapshot,
  resolveLiveAcceptanceExecutionSelections,
} from "../packages/core/src/release/live-acceptance-selection-preflight.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { YeonjangRegistryInstanceView } from "../packages/core/src/yeonjang/registry.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const NOW = Date.parse("2026-07-17T20:00:00.000Z")
const MAX_AGE_MS = 30_000
let stateDir = ""

function requestSelection(): LiveAcceptanceExecutionSelection {
  return Object.freeze({
    extensions: Object.freeze([
      Object.freeze({
        capability: "skill" as const,
        agentId: "agent:release",
        bindingId: "binding:release:skill",
        catalogId: "skill:release-probe",
        toolName: "release_skill_probe",
        readOnly: true as const,
        params: Object.freeze({ probe: "health" }),
      }),
      Object.freeze({
        capability: "mcp" as const,
        agentId: "agent:release",
        bindingId: "binding:release:mcp",
        catalogId: "release-probe",
        toolName: "mcp__release_probe__health",
        readOnly: true as const,
        params: Object.freeze({ probe: "health" }),
      }),
    ]),
    yeonjang: Object.freeze({
      instanceId: "instance:office-mac",
      sessionId: "session:office-mac:11",
      method: "system.info" as const,
      readOnly: true as const,
    }),
  })
}

function extensionSnapshot(
  capability: "skill" | "mcp",
): LiveAcceptanceRuntimeSnapshot["extensions"][number] {
  const selected = requestSelection().extensions.find((item) => item.capability === capability)
  if (!selected) throw new Error(`missing_extension_fixture:${capability}`)
  return Object.freeze({
    bindingId: selected.bindingId,
    agentId: selected.agentId,
    capabilityKind: capability === "skill" ? "skill" : "mcp_server",
    catalogId: selected.catalogId,
    bindingStatus: "enabled",
    secretScopeId: capability === "mcp" ? "secret:release:mcp" : null,
    enabledToolNamesJson: JSON.stringify([selected.toolName]),
    disabledToolNamesJson: "[]",
  })
}

function catalogSnapshot(
  capability: "skill" | "mcp",
): LiveAcceptanceRuntimeSnapshot["catalogs"][number] {
  const selected = requestSelection().extensions.find((item) => item.capability === capability)
  if (!selected) throw new Error(`missing_catalog_fixture:${capability}`)
  return Object.freeze({
    capability,
    catalogId: selected.catalogId,
    status: "enabled",
    risk: "safe",
    toolNamesJson: JSON.stringify([selected.toolName]),
  })
}

function yeonjangSnapshot(): LiveAcceptanceRuntimeSnapshot["yeonjangInstances"][number] {
  return Object.freeze({
    instanceId: "instance:office-mac",
    displayName: "Office Mac",
    state: "online",
    trustState: "trusted",
    scopeAccess: "allowed",
    runnableTarget: true,
    liveSessionCount: 1,
    duplicateLiveSessionDetected: false,
    session: Object.freeze({
      sessionId: "session:office-mac:11",
      state: "connected",
      lastSeenAt: NOW - 1_000,
      endedAt: null,
      stale: false,
    }),
  })
}

function snapshot(): LiveAcceptanceRuntimeSnapshot {
  return Object.freeze({
    capturedAt: NOW,
    extensions: Object.freeze([extensionSnapshot("skill"), extensionSnapshot("mcp")]),
    catalogs: Object.freeze([catalogSnapshot("skill"), catalogSnapshot("mcp")]),
    tools: Object.freeze(
      requestSelection().extensions.map((item) =>
        Object.freeze({
          name: item.toolName,
          riskLevel: "safe" as const,
          requiresApproval: false,
          hasSideEffect: false,
        }),
      ),
    ),
    yeonjangInstances: Object.freeze([yeonjangSnapshot()]),
  })
}

function resolve(current = snapshot()) {
  return resolveLiveAcceptanceExecutionSelections({
    selection: requestSelection(),
    snapshot: current,
    now: NOW,
    maxYeonjangAgeMs: MAX_AGE_MS,
  })
}

function replaceSnapshot(
  current: LiveAcceptanceRuntimeSnapshot,
  patch: Partial<LiveAcceptanceRuntimeSnapshot>,
): LiveAcceptanceRuntimeSnapshot {
  return Object.freeze({ ...current, ...patch })
}

function toolAt(current: LiveAcceptanceRuntimeSnapshot, index: number) {
  const tool = current.tools[index]
  if (!tool) throw new Error(`missing_tool_fixture:${index}`)
  return tool
}

function yeonjangSessionFixture() {
  const session = yeonjangSnapshot().session
  if (!session) throw new Error("missing_yeonjang_session_fixture")
  return session
}

beforeEach(() => {
  closeDb()
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-task167-"))
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

describe("Task 167 pure exact live-selection preflight", () => {
  it("keeps DB, tools, registry, environment and provider access outside the pure resolver", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/release/live-acceptance-selection-preflight.ts"),
      "utf8",
    )

    expect(source).not.toContain("process.env")
    expect(source).not.toMatch(/from ["'][^"']*(?:db|dispatcher|registry|provider)[^"']*["']/u)
    expect(source).not.toContain("getDb(")
    expect(source).not.toContain("getToolDispatcher(")
  })

  it("resolves exactly one Skill, one MCP and one fresh trusted Yeonjang selection", () => {
    const result = resolve()

    expect(result.status).toBe("verified")
    if (result.status !== "verified") throw new Error(result.reasonCode)
    expect(result.extensions.map((item) => item.scenario.capability)).toEqual(["skill", "mcp"])
    expect(result.extensions[0]?.scenario.expectedToolName).toBe("release_skill_probe")
    expect(result.extensions[0]?.authorization).toEqual({
      snapshotCapturedAt: NOW,
      capability: "skill",
      agentId: "agent:release",
      bindingId: "binding:release:skill",
      catalogId: "skill:release-probe",
      toolName: "release_skill_probe",
    })
    expect(result.extensions[1]?.authorization).toEqual({
      snapshotCapturedAt: NOW,
      capability: "mcp",
      agentId: "agent:release",
      bindingId: "binding:release:mcp",
      catalogId: "release-probe",
      toolName: "mcp__release_probe__health",
      secretScopeId: "secret:release:mcp",
    })
    expect(result.yeonjang.instance).toEqual(
      expect.objectContaining({
        instanceId: "instance:office-mac",
        sessionId: "session:office-mac:11",
        status: "connected",
        trustState: "trusted",
        runnableTarget: true,
      }),
    )
    expect(Object.isFrozen(result.extensions)).toBe(true)
    expect(result.extensions.every((item) => Object.isFrozen(item.authorization))).toBe(true)
    expect(Object.isFrozen(result.yeonjang.instance)).toBe(true)
  })

  it.each([
    [
      "live_preflight_binding_owner_mismatch",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          extensions: Object.freeze([
            { ...extensionSnapshot("skill"), agentId: "agent:other" },
            extensionSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_binding_kind_mismatch",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          extensions: Object.freeze([
            { ...extensionSnapshot("skill"), capabilityKind: "mcp_server" },
            extensionSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_binding_catalog_mismatch",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          extensions: Object.freeze([
            { ...extensionSnapshot("skill"), catalogId: "skill:other" },
            extensionSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_binding_not_enabled",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          extensions: Object.freeze([
            { ...extensionSnapshot("skill"), bindingStatus: "disabled" },
            extensionSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_binding_tool_not_allowed",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          extensions: Object.freeze([
            { ...extensionSnapshot("skill"), enabledToolNamesJson: "[]" },
            extensionSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_binding_tool_list_invalid",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          extensions: Object.freeze([
            { ...extensionSnapshot("skill"), enabledToolNamesJson: "not-json" },
            extensionSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_binding_tool_disabled",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          extensions: Object.freeze([
            {
              ...extensionSnapshot("skill"),
              disabledToolNamesJson: JSON.stringify(["release_skill_probe"]),
            },
            extensionSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_catalog_not_enabled",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          catalogs: Object.freeze([
            { ...catalogSnapshot("skill"), status: "archived" },
            catalogSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_catalog_tool_mismatch",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          catalogs: Object.freeze([
            { ...catalogSnapshot("skill"), toolNamesJson: JSON.stringify(["other_tool"]) },
            catalogSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_catalog_not_safe",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          catalogs: Object.freeze([
            { ...catalogSnapshot("skill"), risk: "moderate" },
            catalogSnapshot("mcp"),
          ]),
        }),
    ],
    [
      "live_preflight_tool_ambiguous",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          tools: Object.freeze([toolAt(base, 0), toolAt(base, 0), toolAt(base, 1)]),
        }),
    ],
    [
      "live_preflight_tool_not_read_only",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          tools: Object.freeze([
            {
              name: "release_skill_probe",
              riskLevel: "safe",
              requiresApproval: true,
              hasSideEffect: false,
            },
            toolAt(base, 1),
          ]),
        }),
    ],
    [
      "live_preflight_tool_not_read_only",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          tools: Object.freeze([
            {
              name: "release_skill_probe",
              riskLevel: "safe",
              requiresApproval: false,
              hasSideEffect: true,
            },
            toolAt(base, 1),
          ]),
        }),
    ],
    [
      "live_preflight_tool_not_read_only",
      (base: LiveAcceptanceRuntimeSnapshot) =>
        replaceSnapshot(base, {
          tools: Object.freeze([
            {
              name: "release_skill_probe",
              riskLevel: "moderate",
              requiresApproval: false,
              hasSideEffect: false,
            },
            toolAt(base, 1),
          ]),
        }),
    ],
  ] as const)("rejects extension mismatch: %s", (reasonCode, mutate) => {
    expect(resolve(mutate(snapshot()))).toEqual({ status: "rejected", reasonCode })
  })

  it("rejects an MCP binding without an exact secret scope before dispatch", () => {
    const current = snapshot()
    expect(
      resolve(
        replaceSnapshot(current, {
          extensions: Object.freeze([
            extensionSnapshot("skill"),
            { ...extensionSnapshot("mcp"), secretScopeId: null },
          ]),
        }),
      ),
    ).toEqual({
      status: "rejected",
      reasonCode: "live_preflight_binding_secret_scope_missing",
    })
  })

  it.each([
    ["live_preflight_yeonjang_not_online", { state: "offline" }],
    ["live_preflight_yeonjang_untrusted", { trustState: "pending" }],
    ["live_preflight_yeonjang_scope_denied", { scopeAccess: "foreign" }],
    ["live_preflight_yeonjang_not_runnable", { runnableTarget: false }],
    [
      "live_preflight_yeonjang_duplicate",
      { liveSessionCount: 2, duplicateLiveSessionDetected: true },
    ],
  ] as const)("rejects unsafe Yeonjang state: %s", (reasonCode, instancePatch) => {
    const current = snapshot()
    const instance = { ...yeonjangSnapshot(), ...instancePatch }
    expect(
      resolve(replaceSnapshot(current, { yeonjangInstances: Object.freeze([instance]) })),
    ).toEqual({ status: "rejected", reasonCode })
  })

  it.each([
    ["live_preflight_yeonjang_session_mismatch", { sessionId: "session:other" }],
    ["live_preflight_yeonjang_session_inactive", { endedAt: NOW - 2_000 }],
    ["live_preflight_yeonjang_session_stale", { lastSeenAt: NOW - MAX_AGE_MS - 1 }],
  ] as const)("rejects unsafe Yeonjang session: %s", (reasonCode, sessionPatch) => {
    const current = snapshot()
    const instance = {
      ...yeonjangSnapshot(),
      session: { ...yeonjangSessionFixture(), ...sessionPatch },
    }
    expect(
      resolve(replaceSnapshot(current, { yeonjangInstances: Object.freeze([instance]) })),
    ).toEqual({ status: "rejected", reasonCode })
  })
})

describe("Task 167 one-time runtime snapshot capture", () => {
  it("captures each runtime source once, strips executable details and deeply freezes the snapshot", () => {
    for (const current of requestSelection().extensions) {
      const isSkill = current.capability === "skill"
      if (isSkill) {
        upsertSkillCatalogEntry({
          skillId: current.catalogId,
          displayName: "Release probe",
          toolNames: [current.toolName],
        })
      } else {
        upsertMcpServerCatalogEntry({
          mcpServerId: current.catalogId,
          displayName: "Release probe",
          toolNames: [current.toolName],
        })
      }
      upsertAgentCapabilityBinding({
        bindingId: current.bindingId,
        agentId: current.agentId,
        capabilityKind: isSkill ? "skill" : "mcp_server",
        catalogId: current.catalogId,
        ...(isSkill ? {} : { secretScopeId: "secret:release:mcp" }),
        enabledToolNames: [current.toolName],
      })
    }
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    for (const current of requestSelection().extensions) {
      dispatcher.register({
        name: current.toolName,
        description: "read-only release probe",
        parameters: { type: "object", properties: {} },
        riskLevel: "safe",
        requiresApproval: false,
        execute: vi.fn(async () => ({ success: true, output: "must-not-be-captured" })),
      })
    }
    const registryInstance: YeonjangRegistryInstanceView = {
      instanceId: "instance:office-mac",
      instanceAlias: "office-mac",
      displayName: "Office Mac",
      normalizedCallName: "office mac",
      nodeId: "node:office-mac",
      supportProfile: "full",
      platform: "darwin",
      arch: "arm64",
      version: "1.0.0",
      protocolVersion: "1",
      capabilityHash: "hash",
      methodCount: 1,
      state: "online",
      stateMessage: null,
      lastSeenAt: NOW - 1_000,
      liveSessionCount: 1,
      duplicateLiveSessionDetected: false,
      isLocalCandidate: true,
      localMarker: true,
      ownerUserId: "user:release",
      workspaceScopeId: "workspace:release",
      scopeAccess: "allowed",
      trustState: "trusted",
      trustReason: null,
      pairingFingerprintPreview: "private",
      runnableTarget: true,
      runnableReasonCodes: [],
      hostFingerprintPreview: "private",
      installFingerprintPreview: "private",
      transport: ["mqtt"],
      session: {
        sessionId: "session:office-mac:11",
        clientId: "private-client",
        startupMode: "tray",
        windowMode: "hidden",
        trayState: "visible",
        state: "connected",
        message: "private-message",
        startedAt: NOW - 10_000,
        lastSeenAt: NOW - 1_000,
        endedAt: null,
        stale: false,
      },
    }
    const readers = {
      listBindings: vi.fn(() => listAgentCapabilityBindings({ includeArchived: true })),
      listSkillCatalogs: vi.fn(() => listSkillCatalogEntries({ includeArchived: true })),
      listMcpCatalogs: vi.fn(() => listMcpServerCatalogEntries({ includeArchived: true })),
      listTools: vi.fn(() => dispatcher.getAll({ includeIsolated: true })),
      listYeonjangInstances: vi.fn(() => [registryInstance]),
    }

    const captured = captureLiveAcceptanceRuntimeSnapshot({ capturedAt: NOW, readers })
    const result = resolve(captured)

    if (result.status !== "verified") throw new Error(result.reasonCode)
    expect(result.status).toBe("verified")
    expect(Object.values(readers).every((reader) => reader.mock.calls.length === 1)).toBe(true)
    expect(readers.listYeonjangInstances).toHaveBeenCalledWith(NOW)
    expect(Object.isFrozen(captured)).toBe(true)
    expect(Object.isFrozen(captured.yeonjangInstances[0]?.session)).toBe(true)
    expect(
      captured.extensions.find((item) => item.capabilityKind === "mcp_server")?.secretScopeId,
    ).toBe("secret:release:mcp")
    expect(JSON.stringify(captured)).not.toContain("must-not-be-captured")
    expect(JSON.stringify(captured)).not.toContain("private-message")
    expect(JSON.stringify(captured)).not.toContain("private-client")
    expect(JSON.stringify(captured)).not.toContain("Fingerprint")
  })
})
