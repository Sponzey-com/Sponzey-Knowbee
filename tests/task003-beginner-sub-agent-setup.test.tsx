import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../packages/core/src/runs/store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../packages/core/src/runs/store.js")>()),
  updateActiveRunsMaxDelegationTurns: () => undefined,
}))

import { buildSetupDraft, saveSetupDraft } from "../packages/core/src/control-plane/index.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  buildBeginnerSubAgentReadinessPanel,
  createBeginnerSubAgent,
  createDefaultBeginnerSubAgent,
  ensureSubAgentSetupDraft,
  nextDefaultSubAgentDisplayName,
} from "../packages/webui/src/lib/beginner-sub-agents.ts"
import {
  BeginnerSubAgentCreateDialog,
  SubAgentReadinessPanel,
} from "../packages/webui/src/components/setup/SubAgentReadinessPanel.tsx"

function buildDraft() {
  return buildSetupDraft(runtimeFixture.load(), runtimeFixture.paths)
}

function visitNode(node: unknown, visit: (candidate: Record<string, unknown>) => void) {
  if (node == null || typeof node === "boolean") return
  if (Array.isArray(node)) {
    for (const item of node) visitNode(item, visit)
    return
  }
  if (typeof node === "object" && "props" in node) {
    const candidate = node as Record<string, unknown>
    const type = candidate.type
    if (typeof type === "function") {
      visitNode(type(candidate.props as never), visit)
      return
    }
    visit(candidate)
    const props = candidate.props
    if (props && typeof props === "object" && "children" in props) {
      visitNode((props as Record<string, unknown>).children, visit)
    }
  }
}

function findDataValues(node: unknown, key: string): string[] {
  const values: string[] = []
  visitNode(node, (candidate) => {
    const props = candidate.props
    if (!props || typeof props !== "object") return
    const value = (props as Record<string, unknown>)[key]
    if (typeof value === "string") values.push(value)
  })
  return values
}

function textContent(node: unknown): string {
  const chunks: string[] = []
  function visit(value: unknown) {
    if (typeof value === "string" || typeof value === "number") {
      chunks.push(String(value))
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value && typeof value === "object" && "props" in value) {
      const candidate = value as { type?: unknown; props?: { children?: unknown } }
      if (typeof candidate.type === "function") {
        visit(candidate.type(candidate.props as never))
        return
      }
      visit(candidate.props?.children)
    }
  }
  visit(node)
  return chunks.join(" ")
}

function draft(overrides: Partial<SetupDraft> = {}): SetupDraft {
  return {
    personal: { profileName: "dongwoo", displayName: "Dongwoo", language: "ko", timezone: "Asia/Seoul", workspace: "/tmp" },
    aiBackends: [
      {
        id: "provider:openai",
        label: "OpenAI",
        kind: "provider",
        providerType: "openai",
        authMode: "api_key",
        credentials: { apiKey: "sk-test" },
        local: false,
        enabled: true,
        availableModels: ["gpt-5.4"],
        defaultModel: "gpt-5.4",
        status: "ready",
        summary: "primary",
        tags: ["primary"],
        endpoint: "https://api.openai.com/v1",
      },
    ],
    routingProfiles: [{ id: "default", label: "Default", targets: ["provider:openai"] }],
    mcp: { servers: [{ id: "mcp:browser", name: "Browser", transport: "stdio", command: "browser", argsText: "", cwd: "", url: "", required: false, enabled: true, status: "ready", tools: ["search"] }] },
    skills: { items: [{ id: "skill:research", label: "Research", description: "Find facts", source: "builtin", path: "", enabled: true, required: false, status: "ready" }] },
    security: { approvalMode: "on-miss", approvalTimeout: 60, approvalTimeoutFallback: "deny", maxDelegationTurns: 5 },
    channels: {} as SetupDraft["channels"],
    mqtt: { enabled: false, host: "0.0.0.0", port: 1883, username: "", password: "" },
    remoteAccess: { authEnabled: false, authToken: "", host: "127.0.0.1", port: 18888 },
    ...overrides,
  }
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

beforeEach(() => {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task003-beginner-subagents-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task003 beginner sub-agent setup", () => {
  it("treats zero sub-agents in single Knowbee mode as a normal empty state", () => {
    const panel = buildBeginnerSubAgentReadinessPanel({
      draft: draft(),
      language: "ko",
      now: 1_780_000_000_000,
    })

    expect(panel.status).toBe("empty")
    expect(panel.tone).toBe("info")
    expect(panel.stats.topLevelCount).toBe(0)
    expect(panel.summary).not.toMatch(/오류|error|blocked/i)
  })

  it("uses the configured main-agent name in beginner sub-agent guidance", () => {
    const panel = buildBeginnerSubAgentReadinessPanel({
      draft: draft({ mainAgent: { name: "마당쇠" } }),
      language: "ko",
      now: 1_780_000_000_000,
    })
    const dialogTree = createElement(BeginnerSubAgentCreateDialog, {
      open: true,
      language: "ko",
      mainAgentName: "마당쇠",
      value: { agentName: "", role: "", description: "" },
      onChange: () => undefined,
      onCancel: () => undefined,
      onSubmit: () => undefined,
      saving: false,
    })
    const dialogText = textContent(dialogTree)

    expect(panel.summary).toContain("마당쇠")
    expect(panel.summary).not.toContain("노비")
    expect(dialogText).toContain("마당쇠의 직속 서브 에이전트")
    expect(dialogText).not.toContain("노비")
    expect(dialogText).not.toMatch(/agent:/)
  })

  it("shows orchestration attention when orchestration is on but no active sub-agent exists", () => {
    const base = draft()
    const ensured = ensureSubAgentSetupDraft(base)
    const panel = buildBeginnerSubAgentReadinessPanel({
      draft: { ...base, subAgents: { ...ensured, orchestrationEnabled: true } },
      language: "ko",
      now: 1_780_000_000_000,
    })

    expect(panel.status).toBe("needs_attention")
    expect(panel.summary).toContain("서브 에이전트")
    expect(JSON.stringify(panel)).not.toMatch(/agent:/)
  })

  it("creates a direct child sub-agent through the shared command validator", () => {
    const created = createBeginnerSubAgent(draft(), {
      agentName: "Researcher",
      role: "자료를 찾고 근거를 정리합니다.",
      description: "검색과 요약을 맡습니다.",
    }, 1_780_000_000_000)

    expect(created.ok).toBe(true)
    expect(created.draft?.subAgents?.items[0]).toEqual(expect.objectContaining({
      agentName: "Researcher",
      role: "자료를 찾고 근거를 정리합니다.",
      status: "enabled",
    }))
    expect(created.draft?.subAgents?.items[0]).not.toHaveProperty("displayName")
    expect(created.draft?.subAgents?.items[0]).not.toHaveProperty("nickname")

    const panel = buildBeginnerSubAgentReadinessPanel({
      draft: created.draft!,
      language: "ko",
      now: 1_780_000_000_000,
    })
    expect(panel.cards[0]?.agentName).toBe("Researcher")
    expect(panel.cards[0]?.displayLabel).toBe("Researcher")
    expect(panel.stats.pendingRuntimeCount).toBe(1)
  })

  it("keeps the beginner root agent derived from draft main-agent name only", () => {
    const source = readFileSync("packages/webui/src/lib/beginner-sub-agents.ts", "utf8")

    expect(source).toContain("rootAgentForDraft")
    expect(source).toContain("draft.mainAgent?.name.trim()")
    expect(source).not.toContain('agentName: "노비"')
    expect(source).not.toContain('displayName: "Knowbee"')
    expect(source).not.toContain('nickname: "Knowbee"')
  })

  it("creates default sub-agents for the topology workspace without duplicate names", () => {
    const first = createDefaultBeginnerSubAgent(draft(), 1_780_000_000_000, "ko")
    expect(first.ok).toBe(true)
    expect(first.draft?.subAgents?.orchestrationEnabled).toBe(true)
    expect(first.draft?.subAgents?.items[0]).toEqual(expect.objectContaining({
      agentName: "새 서브 에이전트 1",
      role: "서브 에이전트",
      description: "이 서브 에이전트가 맡을 일을 적어주세요.",
      status: "enabled",
    }))
    expect(first.draft?.subAgents?.items[0]).not.toHaveProperty("displayName")
    expect(first.draft?.subAgents?.items[0]).not.toHaveProperty("nickname")

    const second = createDefaultBeginnerSubAgent(first.draft!, 1_780_000_001_000, "ko")
    expect(second.ok).toBe(true)
    expect(second.draft?.subAgents?.items.map((item) => item.agentName)).toEqual([
      "새 서브 에이전트 1",
      "새 서브 에이전트 2",
    ])
    expect(nextDefaultSubAgentDisplayName(second.draft!)).toBe("새 서브 에이전트 3")
  })

  it("returns user-facing validation messages for missing, duplicate, and reserved names", () => {
    const base = createBeginnerSubAgent(draft(), {
      agentName: "Researcher",
      role: "자료 조사",
      description: "검색",
    }, 1_780_000_000_000).draft!

    expect(createBeginnerSubAgent(base, {
      agentName: "",
      role: "정리",
      description: "",
    }, 1_780_000_001_000).fieldErrors.agentName).toContain("이름")

    const duplicate = createBeginnerSubAgent(base, {
      agentName: "researcher",
      role: "문서 작성",
      description: "",
    }, 1_780_000_001_000)
    expect(duplicate.ok).toBe(false)
    expect(duplicate.issueCodes).toContain("agent_name_duplicate")
    expect(duplicate.fieldErrors.agentName).toContain("이미 사용 중")
    expect(duplicate.message).toContain("이미 사용 중")
    expect(duplicate.message).not.toMatch(/nickname|별명|agent:/)

    const reserved = createBeginnerSubAgent(base, {
      agentName: "Knowbee",
      role: "예약명 테스트",
      description: "",
    }, 1_780_000_001_000)
    expect(reserved.ok).toBe(false)
    expect(reserved.message).toContain("메인 에이전트")
    expect(reserved.message).not.toMatch(/reserved_knowbee_name|agent:/)

    const configuredRootName = createBeginnerSubAgent(draft({ mainAgent: { name: "마당쇠" } }), {
      agentName: "마당쇠",
      role: "예약명 테스트",
      description: "",
    }, 1_780_000_001_000)
    expect(configuredRootName.ok).toBe(false)
    expect(configuredRootName.issueCodes).toContain("reserved_knowbee_name")
    expect(configuredRootName.message).toContain("메인 에이전트")
    expect(configuredRootName.message).not.toMatch(/Knowbee|노비|agent:/)
  })

  it("renders the readiness panel and create dialog without exposing internal ids", () => {
    const created = createBeginnerSubAgent(draft(), {
      agentName: "Researcher",
      role: "자료 조사",
      description: "검색",
    }, 1_780_000_000_000).draft!
    const panel = buildBeginnerSubAgentReadinessPanel({ draft: created, language: "ko" })

    const panelTree = createElement(SubAgentReadinessPanel, {
      panel,
      language: "ko",
      onCreate: () => undefined,
    })
    const dialogTree = createElement(BeginnerSubAgentCreateDialog, {
      open: true,
      language: "ko",
      mainAgentName: "마당쇠",
      value: { agentName: "", role: "", description: "" },
      fieldErrors: { agentName: "이름을 입력해야 합니다." },
      onChange: () => undefined,
      onCancel: () => undefined,
      onSubmit: () => undefined,
      saving: false,
    })

    expect(findDataValues(panelTree, "data-sub-agent-readiness-panel")).toContain("pending_runtime")
    expect(findDataValues(dialogTree, "data-sub-agent-create-dialog")).toContain("open")
    expect(textContent(panelTree)).toContain("Researcher")
    expect(textContent(dialogTree)).toContain("에이전트 이름")
    expect(textContent(dialogTree)).toContain("마당쇠의 직속 서브 에이전트")
    expect(textContent(dialogTree)).toContain("이름을 입력해야 합니다.")
    expect(textContent(dialogTree)).not.toContain("별명")
    expect(textContent(dialogTree)).not.toContain("직접 하위")
    expect(textContent(panelTree)).not.toMatch(/agent:/)
    expect(textContent(dialogTree)).not.toMatch(/agent:/)
  })

  it("keeps the beginner sub-agent create dialog to a single agent name input", () => {
    const source = readFileSync(
      new URL("../packages/webui/src/components/setup/SubAgentReadinessPanel.tsx", import.meta.url),
      "utf-8",
    )

    expect(source).toContain('label={pickUiText(language, "에이전트 이름", "Agent name")}')
    expect(source).not.toContain('label={pickUiText(language, "이름", "Name")}')
    expect(source).toContain("value={value.agentName}")
    expect(source).toContain("onChange({ agentName: next })")
    expect(source).toContain("직속 서브 에이전트")
    expect(source).toContain("mainAgentName")
    expect(source).not.toContain("직접 하위")
    expect(source).not.toContain("direct child")
    expect(source).not.toContain("value={value.nickname || value.displayName}")
    expect(source).not.toContain("onChange({ displayName: next, nickname: next })")
  })

  it("round-trips beginner-created sub-agents through setup draft persistence", () => {
    const initial = buildDraft() as unknown as SetupDraft
    const created = createBeginnerSubAgent(initial, {
      agentName: "Researcher",
      role: "자료 조사",
      description: "검색",
    }, 1_780_000_000_000)
    expect(created.ok).toBe(true)

    const saved = saveSetupDraft(
      created.draft as ReturnType<typeof buildSetupDraft>,
      undefined,
      runtimeFixture.load(),
      runtimeFixture.paths,
    )
    expect(saved.draft.subAgents?.items[0]).toEqual(expect.objectContaining({
      agentName: "Researcher",
    }))
    expect(saved.draft.subAgents?.items[0]).not.toHaveProperty("displayName")
    expect(saved.draft.subAgents?.items[0]).not.toHaveProperty("nickname")

    const reloaded = buildDraft()
    expect(reloaded.subAgents?.items[0]).toEqual(expect.objectContaining({
      agentName: "Researcher",
    }))
    expect(reloaded.subAgents?.items[0]).not.toHaveProperty("displayName")
    expect(reloaded.subAgents?.items[0]).not.toHaveProperty("nickname")
    const persistedConfig = runtimeFixture.load()
    expect(persistedConfig.orchestration.subAgents?.[0]).toEqual(expect.objectContaining({
      agentId: reloaded.subAgents?.items[0]?.agentId,
      agentName: "Researcher",
    }))
    expect(persistedConfig.orchestration.subAgents?.[0]).not.toHaveProperty("displayName")
    expect(persistedConfig.orchestration.subAgents?.[0]).not.toHaveProperty("nickname")
  })
})
