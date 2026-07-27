import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const getMqttBrokerSnapshot = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const upsertSkillCatalogEntry = vi.fn()
const listAgentCapabilityBindings = vi.fn()
const upsertAgentCapabilityBinding = vi.fn()
const insertMessage = vi.fn()

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttBrokerSnapshot,
  getMqttExtensionSnapshots,
}))

vi.mock("../packages/core/src/db/index.js", () => ({
  listAgentCapabilityBindings,
  insertMessage,
  upsertAgentCapabilityBinding,
  upsertSkillCatalogEntry,
}))

const { yeonjangStatusTool } = await import("../packages/core/src/tools/builtin/yeonjang-status.ts")
const {
  registerBuiltinSkills,
  YEONJANG_SKILL_TOOL_NAMES,
} = await import("../packages/core/src/skills/builtin.ts")
const { registerBuiltinTools } = await import("../packages/core/src/tools/index.ts")

function context(): ToolContext {
  return {
    sessionId: "telegram-session",
    runId: "run-1",
    workDir: process.cwd(),
    userMessage: "연장 연결 상태 확인해봐",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("built-in Yeonjang skill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listAgentCapabilityBindings.mockReturnValue([])
    getMqttBrokerSnapshot.mockReturnValue({
      enabled: true,
      running: true,
      host: "0.0.0.0",
      port: 1883,
      url: "mqtt://0.0.0.0:1883",
      clientCount: 1,
      authEnabled: true,
      allowAnonymous: false,
      reason: null,
    })
    getMqttExtensionSnapshots.mockReturnValue([{
      extensionId: "yeonjang-main",
      clientId: "private-client-id",
      displayName: "작업용 맥",
      state: "online",
      message: "ready",
      version: "0.2.5",
      platform: "macos",
      methods: ["screen.capture", "system.exec"],
      trustState: "trusted",
      lastSeenAt: Date.parse("2026-07-14T03:00:00.000Z"),
    }])
  })

  it("registers Yeonjang as a built-in skill with its tools", () => {
    registerBuiltinSkills({ mainAgentId: "agent:마당쇠", now: 1234 })

    expect(upsertSkillCatalogEntry).toHaveBeenCalledWith({
      skillId: "skill:yeonjang",
      displayName: "Yeonjang computer control",
      status: "enabled",
      risk: "moderate",
      toolNames: expect.arrayContaining([
        "yeonjang_status",
        "screen_capture",
        "shell_exec",
        "yeonjang_camera_list",
        "yeonjang_camera_permission_status",
        "yeonjang_file_read",
        "yeonjang_file_write",
        "yeonjang_file_patch",
        "yeonjang_file_delete",
        "yeonjang_disk_info",
        "yeonjang_process_list",
        "yeonjang_browser_list",
      ]),
      metadata: expect.objectContaining({ builtin: true, capability: "computer_control" }),
      createdAt: 1234,
      updatedAt: 1234,
    }, { source: "system", now: 1234 })

    expect(upsertAgentCapabilityBinding).toHaveBeenCalledWith({
      bindingId: "binding:agent:마당쇠:skill:yeonjang",
      agentId: "agent:마당쇠",
      capabilityKind: "skill",
      catalogId: "skill:yeonjang",
      status: "enabled",
      enabledToolNames: expect.arrayContaining([
        "yeonjang_status",
        "screen_capture",
        "shell_exec",
        "yeonjang_file_read",
        "yeonjang_file_write",
        "yeonjang_file_patch",
        "yeonjang_file_delete",
        "yeonjang_disk_info",
        "yeonjang_process_list",
        "yeonjang_browser_list",
      ]),
      disabledToolNames: [],
      approvalRequiredFrom: "moderate",
      createdAt: 1234,
      updatedAt: 1234,
    }, { source: "system", now: 1234 })
  })

  it("keeps the Yeonjang skill limited to tools that use the Yeonjang boundary", () => {
    expect(YEONJANG_SKILL_TOOL_NAMES).toEqual([
      "yeonjang_status",
      "yeonjang_broadcast_run",
      "yeonjang_camera_list",
      "yeonjang_camera_capture",
      "yeonjang_camera_permission_status",
      "yeonjang_file_metadata",
      "yeonjang_file_list",
      "yeonjang_file_read",
      "yeonjang_file_search",
      "yeonjang_file_write",
      "yeonjang_file_patch",
      "yeonjang_file_delete",
      "yeonjang_disk_info",
      "yeonjang_disk_usage",
      "yeonjang_disk_exists",
      "yeonjang_process_list",
      "yeonjang_process_info",
      "yeonjang_browser_list",
      "yeonjang_browser_active_hint",
      "yeonjang_browser_open_url",
      "yeonjang_browser_focus",
      "yeonjang_clipboard_read",
      "yeonjang_clipboard_write",
      "yeonjang_network_status",
      "yeonjang_device_status",
      "shell_exec",
      "app_launch",
      "screen_capture",
      "screen_find_text",
      "mouse_move",
      "mouse_click",
      "mouse_action",
      "keyboard_type",
      "keyboard_shortcut",
      "keyboard_action",
    ])
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toEqual(expect.arrayContaining([
      "process_list",
      "clipboard_read",
      "window_list",
    ]))
  })

  it("preserves an existing Yeonjang binding while adding the independent web binding", () => {
    listAgentCapabilityBindings.mockReturnValue([{
      binding_id: "binding:user-choice",
      agent_id: "agent:knowbee",
      capability_kind: "skill",
      catalog_id: "skill:yeonjang",
      status: "disabled",
    }])

    registerBuiltinSkills({ mainAgentId: "agent:knowbee", now: 1234 })

    expect(upsertSkillCatalogEntry).toHaveBeenCalledTimes(2)
    expect(upsertAgentCapabilityBinding).toHaveBeenCalledTimes(1)
    expect(upsertAgentCapabilityBinding).toHaveBeenCalledWith({
      bindingId: "binding:agent:knowbee:skill:web-research",
      agentId: "agent:knowbee",
      capabilityKind: "skill",
      catalogId: "skill:web-research",
      status: "enabled",
      enabledToolNames: ["web_search", "web_fetch"],
      disabledToolNames: [],
      approvalRequiredFrom: "safe",
      createdAt: 1234,
      updatedAt: 1234,
    }, { source: "system", now: 1234 })
  })

  it("backfills existing Yeonjang instance bindings with camera approval permission", () => {
    listAgentCapabilityBindings.mockImplementation((filters?: { capabilityKind?: string }) => {
      if (filters?.capabilityKind === "yeonjang") {
        return [{
          binding_id: "binding:agent:photo:yeonjang:local",
          agent_id: "agent:photo",
          capability_kind: "yeonjang",
          catalog_id: "yi-local",
          status: "enabled",
          secret_scope_id: null,
          enabled_tool_names_json: "[]",
          disabled_tool_names_json: "[]",
          permission_profile_json: null,
          rate_limit_json: null,
          approval_required_from: null,
          source: "manual",
          audit_id: null,
          created_at: 1000,
        }]
      }
      return []
    })

    registerBuiltinSkills({ mainAgentId: "agent:knowbee", now: 1234 })

    expect(upsertAgentCapabilityBinding).toHaveBeenCalledWith({
      bindingId: "binding:agent:photo:yeonjang:local",
      agentId: "agent:photo",
      capabilityKind: "yeonjang",
      catalogId: "yi-local",
      status: "enabled",
      enabledToolNames: ["yeonjang_status", "yeonjang_camera_list", "yeonjang_camera_capture", "yeonjang_camera_permission_status"],
      disabledToolNames: [],
      permissionProfile: expect.objectContaining({
        profileId: "permission:agent:photo:yeonjang-camera",
        riskCeiling: "moderate",
        approvalRequiredFrom: "moderate",
        allowScreenControl: false,
      }),
      approvalRequiredFrom: "moderate",
      createdAt: 1000,
      updatedAt: 1234,
    }, { source: "manual", auditId: null, now: 1234 })
  })

  it("exposes Yeonjang status through the shared channel tool dispatcher", () => {
    const registered: Array<{ name: string }> = []
    const dispatcher = {
      registerAll(tools: Array<{ name: string }>) {
        registered.push(...tools)
      },
    } as unknown as ToolDispatcher

    registerBuiltinTools(dispatcher)

    expect(registered.map((tool) => tool.name)).toContain("yeonjang_status")
    expect(registered.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "yeonjang_file_metadata",
      "yeonjang_file_list",
      "yeonjang_file_read",
      "yeonjang_file_write",
      "yeonjang_file_patch",
      "yeonjang_file_delete",
      "yeonjang_disk_info",
      "yeonjang_disk_usage",
      "yeonjang_disk_exists",
      "yeonjang_process_list",
      "yeonjang_process_info",
      "yeonjang_browser_list",
      "yeonjang_browser_active_hint",
      "yeonjang_camera_permission_status",
    ]))
  })

  it("allows Telegram requests to select the read-only Yeonjang status tool", () => {
    let statusTool: Parameters<ToolDispatcher["registerAll"]>[0][number] | undefined
    const dispatcher = {
      registerAll(tools: Parameters<ToolDispatcher["registerAll"]>[0]) {
        statusTool = tools.find((tool) => tool.name === "yeonjang_status")
      },
    } as unknown as ToolDispatcher

    registerBuiltinTools(dispatcher)

    expect(statusTool).toBeDefined()
    expect(statusTool?.availableSources == null || statusTool.availableSources.includes("telegram")).toBe(true)
    expect(statusTool).toMatchObject({ riskLevel: "safe", requiresApproval: false })
  })

  it("reports connected Yeonjang instances without exposing transport identity", async () => {
    const result = await yeonjangStatusTool.execute({}, context())

    expect(result.success).toBe(true)
    expect(result.output).toContain("작업용 맥")
    expect(result.output).toContain("online")
    expect(result.output).not.toContain("private-client-id")
    expect(result.details).toMatchObject({
      via: "yeonjang",
      broker: { enabled: true, running: true, clientCount: 1 },
      connectedCount: 1,
      totalCount: 1,
    })
  })

  it("distinguishes a running broker with no connected instance", async () => {
    getMqttExtensionSnapshots.mockReturnValue([])

    const result = await yeonjangStatusTool.execute({}, context())

    expect(result.success).toBe(true)
    expect(result.output).toContain("연결된 연장이 없습니다")
    expect(result.details).toMatchObject({ connectedCount: 0, totalCount: 0 })
  })
})
