import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type {
  AgentOperationalSettingsProjection,
  AgentWorkspaceDetail,
  AgentWorkspacePageResponse,
} from "../packages/webui/src/contracts/agents.js"
import { createAgentOperationalSettingsDraft } from "../packages/webui/src/lib/agent-operational-settings-draft.js"
import { AgentsView } from "../packages/webui/src/pages/AgentsPage.js"

const agentRef = `agent_v1_${"a".repeat(24)}`
const selected: AgentWorkspaceDetail = {
  agentRef,
  name: "Research",
  role: "Evidence research",
  status: "enabled",
  profileVersion: 7,
  updatedAt: 1,
  model: { configured: true, availability: "ready" },
  parentName: "마당쇠",
  directChildCount: 0,
  bindingCounts: { skills: 0, mcpServers: 0, yeonjang: 0 },
  diagnosticCodes: [],
  bindingNames: { skills: [], mcpServers: [], yeonjang: [] },
  directChildNames: [],
}
const page: AgentWorkspacePageResponse = {
  items: [selected],
  nextCursor: null,
  cursorValid: true,
  totalMatches: 1,
  summary: {
    total: 1,
    enabled: 1,
    disabled: 0,
    archived: 0,
    degraded: 0,
    issueCount: 0,
    diagnosticCodes: [],
  },
  observedAt: 1,
}
const settings: AgentOperationalSettingsProjection = {
  agentRef,
  status: "enabled",
  revision: 7,
  model: {
    configured: true,
    availability: "configured",
    providerName: "openai",
    modelName: "gpt-5",
    effort: "high",
  },
  memory: {
    retentionPolicy: "long_term",
    capsuleMode: "rolling_summary",
    rawWindowSize: 24,
    compactThreshold: 40,
    writebackReviewRequired: true,
    lastCompactedAt: null,
    capsuleCount: 3,
  },
  permission: {
    riskCeiling: "sensitive",
    approvalRequiredFrom: "external",
    allowExternalNetwork: true,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: true,
    allowedPathCount: 2,
  },
  diagnosticCodes: [],
  observedAt: 1,
}
const callbacks = {
  onSearch: () => undefined,
  onStatus: () => undefined,
  onRefresh: () => undefined,
  onSelect: () => undefined,
  onClose: () => undefined,
}

function render(activeSection: "basic" | "ai" | "memory" | "permissions", extra = {}) {
  return renderToStaticMarkup(
    createElement(AgentsView, {
      ...callbacks,
      page,
      selected,
      loading: false,
      error: null,
      search: "",
      status: "",
      activeSection,
      settingsProjection: settings,
      settingsDraft: createAgentOperationalSettingsDraft(settings),
      settingsElevationConfirmed: false,
      onSettingsDraft: () => undefined,
      onSettingsElevationConfirmed: () => undefined,
      onSettingsSave: () => undefined,
      ...extra,
    }),
  )
}

describe("Task 042 agent operational settings drawer", () => {
  it("renders all six sections as real tab buttons", () => {
    const html = render("basic")
    for (const label of ["기본", "AI", "기능", "메모리", "권한", "위임"])
      expect(html).toMatch(
        new RegExp(`<button[^>]*aria-pressed="(?:true|false)"[^>]*>${label}</button>`),
      )
  })

  it("renders compact model, memory and permission forms", () => {
    expect(render("ai")).toMatch(/openai[\s\S]*gpt-5[\s\S]*high/u)
    expect(render("memory")).toMatch(/long_term[\s\S]*rolling_summary[\s\S]*24[\s\S]*40/u)
    const permission = render("permissions")
    expect(permission).toMatch(/외부 네트워크[\s\S]*type="checkbox"[\s\S]*checked/u)
    expect(permission).toMatch(/파일 쓰기[\s\S]*type="checkbox"/u)
    expect(permission).toMatch(/허용 경로:\s*2/u)
    expect(permission).toContain("설정 저장")
  })

  it("disables save for an unchanged draft and requires elevation confirmation", () => {
    expect(render("ai")).toMatch(/<button[^>]*disabled[^>]*>설정 저장<\/button>/u)
    const draft = createAgentOperationalSettingsDraft(settings)
    draft.permission.allowShellExecution = true
    const permission = render("permissions", { settingsDraft: draft })
    expect(permission).toContain("권한이 확대되는 변경임을 확인했습니다.")
    expect(permission).toMatch(/<button[^>]*disabled[^>]*>설정 저장<\/button>/u)
  })

  it("shows explicit loading and public error states without private content", () => {
    const loading = render("ai", { settingsProjection: null, settingsLoading: true })
    expect(loading).toContain("설정 불러오는 중")
    const error = render("memory", {
      settingsProjection: null,
      settingsError: "agent_settings_query_failed",
    })
    expect(error).toContain("agent_settings_query_failed")
    for (const html of [render("ai"), render("memory"), render("permissions")])
      expect(html).not.toMatch(
        /ownerId|readScopes|writeScope|allowedPaths|profileId|secretScope|\/Users\/private/iu,
      )
  })
})
