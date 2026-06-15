import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../packages/core/src/runs/store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../packages/core/src/runs/store.js")>()),
  updateActiveRunsMaxDelegationTurns: () => undefined,
}))

import { reloadConfig } from "../packages/core/src/config/index.js"
import { buildSetupDraft, saveSetupDraft } from "../packages/core/src/control-plane/index.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  buildBeginnerSubAgentReadinessPanel,
  createBeginnerSubAgent,
  ensureSubAgentSetupDraft,
} from "../packages/webui/src/lib/beginner-sub-agents.ts"
import {
  BeginnerSubAgentCreateDialog,
  SubAgentReadinessPanel,
} from "../packages/webui/src/components/setup/SubAgentReadinessPanel.tsx"

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
const previousStateDir = process.env.NOBIE_STATE_DIR
const previousConfig = process.env.NOBIE_CONFIG

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-task003-beginner-subagents-"))
  tempDirs.push(stateDir)
  process.env.NOBIE_STATE_DIR = stateDir
  process.env.NOBIE_CONFIG = join(stateDir, "config.json5")
  reloadConfig()
})

afterEach(() => {
  closeDb()
  if (previousStateDir === undefined) delete process.env.NOBIE_STATE_DIR
  else process.env.NOBIE_STATE_DIR = previousStateDir
  if (previousConfig === undefined) delete process.env.NOBIE_CONFIG
  else process.env.NOBIE_CONFIG = previousConfig
  reloadConfig()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task003 beginner sub-agent setup", () => {
  it("treats zero sub-agents in single Nobie mode as a normal empty state", () => {
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
      displayName: "Researcher",
      nickname: "Res",
      role: "자료를 찾고 근거를 정리합니다.",
      description: "검색과 요약을 맡습니다.",
    }, 1_780_000_000_000)

    expect(created.ok).toBe(true)
    expect(created.draft?.subAgents?.items[0]).toEqual(expect.objectContaining({
      displayName: "Researcher",
      nickname: "Res",
      role: "자료를 찾고 근거를 정리합니다.",
      status: "enabled",
    }))

    const panel = buildBeginnerSubAgentReadinessPanel({
      draft: created.draft!,
      language: "ko",
      now: 1_780_000_000_000,
    })
    expect(panel.cards[0]?.displayLabel).toBe("Res")
    expect(panel.stats.pendingRuntimeCount).toBe(1)
  })

  it("returns user-facing validation messages for missing, duplicate, and reserved names", () => {
    const base = createBeginnerSubAgent(draft(), {
      displayName: "Researcher",
      nickname: "Res",
      role: "자료 조사",
      description: "검색",
    }, 1_780_000_000_000).draft!

    expect(createBeginnerSubAgent(base, {
      displayName: "",
      nickname: "New",
      role: "정리",
      description: "",
    }, 1_780_000_001_000).fieldErrors.displayName).toContain("이름")

    const duplicate = createBeginnerSubAgent(base, {
      displayName: "Writer",
      nickname: "res",
      role: "문서 작성",
      description: "",
    }, 1_780_000_001_000)
    expect(duplicate.ok).toBe(false)
    expect(duplicate.message).toContain("이미 사용 중")
    expect(duplicate.message).not.toMatch(/nickname_duplicate|agent:/)

    const reserved = createBeginnerSubAgent(base, {
      displayName: "Nobie",
      nickname: "노비",
      role: "예약명 테스트",
      description: "",
    }, 1_780_000_001_000)
    expect(reserved.ok).toBe(false)
    expect(reserved.message).toContain("노비")
    expect(reserved.message).not.toMatch(/reserved_nobie_name|agent:/)
  })

  it("renders the readiness panel and create dialog without exposing internal ids", () => {
    const created = createBeginnerSubAgent(draft(), {
      displayName: "Researcher",
      nickname: "Res",
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
      value: { displayName: "", nickname: "", role: "", description: "" },
      fieldErrors: { displayName: "이름을 입력해야 합니다." },
      onChange: () => undefined,
      onCancel: () => undefined,
      onSubmit: () => undefined,
      saving: false,
    })

    expect(findDataValues(panelTree, "data-sub-agent-readiness-panel")).toContain("pending_runtime")
    expect(findDataValues(dialogTree, "data-sub-agent-create-dialog")).toContain("open")
    expect(textContent(panelTree)).toContain("Res")
    expect(textContent(dialogTree)).toContain("이름을 입력해야 합니다.")
    expect(textContent(panelTree)).not.toMatch(/agent:/)
    expect(textContent(dialogTree)).not.toMatch(/agent:/)
  })

  it("round-trips beginner-created sub-agents through setup draft persistence", () => {
    const initial = buildSetupDraft() as unknown as SetupDraft
    const created = createBeginnerSubAgent(initial, {
      displayName: "Researcher",
      nickname: "Res",
      role: "자료 조사",
      description: "검색",
    }, 1_780_000_000_000)
    expect(created.ok).toBe(true)

    const saved = saveSetupDraft(created.draft as ReturnType<typeof buildSetupDraft>)
    expect(saved.draft.subAgents?.items[0]).toEqual(expect.objectContaining({
      displayName: "Researcher",
      nickname: "Res",
    }))

    reloadConfig()
    const reloaded = buildSetupDraft()
    expect(reloaded.subAgents?.items[0]).toEqual(expect.objectContaining({
      displayName: "Researcher",
      nickname: "Res",
    }))
    expect(reloadConfig().orchestration.subAgents?.[0]).toEqual(expect.objectContaining({
      agentId: reloaded.subAgents?.items[0]?.agentId,
      displayName: "Researcher",
      nickname: "Res",
    }))
  })
})
