import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildSetupDraft, saveSetupDraft, type SetupSubAgentDraftItem } from "../packages/core/src/control-plane/index.ts"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"

function parseJsonLike(text: string): Record<string, any> {
  return Function(`"use strict"; return (${text});`)() as Record<string, any>
}

function buildDraft() {
  return buildSetupDraft(runtimeFixture.load(), runtimeFixture.paths)
}

function saveDraft(inputDraft: Parameters<typeof saveSetupDraft>[0]) {
  return saveSetupDraft(inputDraft, undefined, runtimeFixture.load(), runtimeFixture.paths)
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempConfig(configText?: string): string {
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-setup-backend-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir, ...(configText ? { configText } : {}) })
  return runtimeFixture.paths.stateDir
}

function permissionProfile() {
  return {
    profileId: "profile:test",
    riskCeiling: "moderate" as const,
    approvalRequiredFrom: "moderate" as const,
    allowExternalNetwork: true,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPaths: [],
  }
}

function setupSubAgentItem(overrides: Partial<SetupSubAgentDraftItem> = {}): SetupSubAgentDraftItem {
  const agentId = overrides.agentId ?? "agent:legacy-only"
  return {
    agentId,
    agentName: overrides.agentName ?? "Research Canonical",
    displayName: overrides.displayName ?? "Legacy Display",
    role: overrides.role ?? "Research worker",
    description: overrides.description ?? "Handles research tasks.",
    skillMcpBindings: overrides.skillMcpBindings ?? {
      enabledSkillIds: [],
      enabledMcpServerIds: [],
      enabledToolNames: [],
      disabledToolNames: [],
    },
    memoryPolicy: overrides.memoryPolicy ?? {
      owner: { ownerType: "sub_agent", ownerId: agentId },
      visibility: "private",
      readScopes: [{ ownerType: "sub_agent", ownerId: agentId }],
      writeScope: { ownerType: "sub_agent", ownerId: agentId },
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: overrides.capabilityPolicy ?? {
      permissionProfile: permissionProfile(),
      allowedCapabilityIds: [],
      deniedCapabilityIds: [],
      approvalRequiredCapabilityIds: [],
      osSensitiveCapabilityIds: [],
    },
    delegationPolicy: overrides.delegationPolicy ?? {
      canDelegate: true,
      directChildOnly: true,
      allowedChildAgentIds: [],
      resultReviewRequired: true,
      aggregationMode: "parent_synthesis",
      redelegationAllowed: true,
      escalationPolicy: "return_to_parent",
      maxParallelSessions: 1,
    },
    status: overrides.status ?? "enabled",
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    profileVersion: overrides.profileVersion ?? 1,
  }
}

function rawSubAgentWithoutAgentName() {
  const agentId = "agent:legacy-only"
  const owner = { ownerType: "sub_agent", ownerId: agentId }
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    displayName: "Legacy Display",
    nickname: "Legacy Nick",
    normalizedNickname: "legacy nick",
    status: "enabled",
    role: "Research worker",
    personality: "Handles research tasks.",
    specialtyTags: [],
    avoidTasks: [],
    memoryPolicy: {
      owner,
      visibility: "private",
      readScopes: [owner],
      writeScope: owner,
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: {
      permissionProfile: permissionProfile(),
      skillMcpAllowlist: {
        enabledSkillIds: [],
        enabledMcpServerIds: [],
        enabledToolNames: [],
        disabledToolNames: [],
      },
      rateLimit: { maxConcurrentCalls: 1 },
    },
    delegationPolicy: {
      enabled: true,
      maxParallelSessions: 1,
      directChildOnly: true,
      allowedChildAgentIds: [],
      resultReviewRequired: true,
      aggregationMode: "parent_synthesis",
      redelegationAllowed: true,
      escalationPolicy: "return_to_parent",
    },
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
    profileVersion: 1,
    createdAt: 1,
    updatedAt: 1,
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("setup backend merge", () => {
  it("does not promote legacy sub-agent displayName or nickname into setup draft agentName", () => {
    useTempConfig(JSON.stringify({
      orchestration: {
        mode: "orchestration",
        featureFlagEnabled: true,
        maxDelegationTurns: 3,
        subAgents: [rawSubAgentWithoutAgentName()],
      },
    }, null, 2))

    const draft = buildDraft()
    const item = draft.subAgents?.items[0]

    expect(item?.agentName).toBe("Unnamed sub-agent")
    expect(item?.agentName).not.toBe("Legacy Display")
    expect(item?.agentName).not.toBe("Legacy Nick")
    expect(item).not.toHaveProperty("displayName")
    expect(item).not.toHaveProperty("nickname")
  })

  it("does not save a missing sub-agent agentName by falling back to displayName", () => {
    const stateDir = useTempConfig()

    const draft = buildDraft()
    const legacyInboundItem = {
      ...setupSubAgentItem({
        agentName: "",
        displayName: "Legacy Display",
      }),
      nickname: "Legacy Nick",
    } as unknown as SetupSubAgentDraftItem
    saveDraft({
      ...draft,
      subAgents: {
        orchestrationEnabled: true,
        items: [legacyInboundItem],
        runtimeActiveAgentIds: [],
        lastRuntimeSeenAtByAgentId: {},
      },
    })

    const raw = parseJsonLike(readFileSync(join(stateDir, "config.json5"), "utf-8"))
    const agentName = raw.orchestration?.subAgents?.[0]?.agentName

    expect(agentName).toBe("Unnamed sub-agent")
    expect(agentName).not.toBe("Legacy Display")
    expect(agentName).not.toBe("Legacy Nick")
    expect(raw.orchestration?.subAgents?.[0]).not.toHaveProperty("displayName")
    expect(raw.orchestration?.subAgents?.[0]).not.toHaveProperty("nickname")
  })

  it("does not promote legacy main-agent displayName or nickname into the setup draft name", () => {
    useTempConfig(JSON.stringify({
      profile: {
        language: "ko",
      },
      orchestration: {
        knowbee: {
          displayName: "Legacy Main Display",
          nickname: "Legacy Main Nick",
        },
      },
    }, null, 2))

    expect(buildDraft().mainAgent?.name).toBe("노비")
  })

  it("preserves explicit setup main-agent name even when it matches the user profile name", () => {
    const stateDir = useTempConfig()

    const draft = buildDraft()
    saveDraft({
      ...draft,
      personal: {
        ...draft.personal,
        profileName: "마당쇠",
        displayName: "마당쇠",
        language: "ko",
      },
      mainAgent: {
        name: "마당쇠",
      },
    })

    const raw = parseJsonLike(readFileSync(join(stateDir, "config.json5"), "utf-8"))

    expect(raw.profile.profileName).toBe("마당쇠")
    expect(raw.profile.displayName).toBe("마당쇠")
    expect(raw.orchestration?.knowbee?.agentName).toBe("마당쇠")
    expect(buildDraft().mainAgent?.name).toBe("마당쇠")
  })

  it("does not enable anthropic provider only from the default anthropic model", () => {
    useTempConfig()

    const draft = buildDraft()
    const anthropicProvider = draft.aiBackends.find((backend) => backend.id === "provider:anthropic")

    expect(anthropicProvider?.defaultModel).toBe("")
    expect(anthropicProvider?.enabled).toBe(false)
    expect(anthropicProvider?.status).toBe("planned")
  })

  it("does not treat an OpenAI endpoint without credentials as an active connection", () => {
    useTempConfig(`
      {
        ai: {
          connection: {
            provider: "openai",
            model: "gpt-5",
            endpoint: "https://api.openai.com/v1",
            auth: { mode: "api_key" }
          }
        }
      }
    `)

    const draft = buildDraft()
    const openai = draft.aiBackends.find((backend) => backend.id === "provider:openai")

    expect(openai?.enabled).toBe(false)
    expect(openai?.status).toBe("planned")
  })

  it("keeps builtin backend identity while clearing stale endpoint and credentials", () => {
    useTempConfig()

    const initialDraft = buildDraft()
    saveDraft({
      ...initialDraft,
      aiBackends: initialDraft.aiBackends.map((backend) => (
        backend.id === "provider:openai"
          ? {
            ...backend,
            providerType: "openai",
            endpoint: "https://api.openai.com/v1",
            credentials: { apiKey: "sk-test" },
            defaultModel: "gpt-4.1",
            enabled: true,
          }
          : backend
      )),
    })

    const configuredDraft = buildDraft()
    saveDraft({
      ...configuredDraft,
      aiBackends: configuredDraft.aiBackends.map((backend) => (
        backend.id === "provider:openai"
          ? {
            ...backend,
            providerType: "gemini",
            endpoint: "",
            credentials: {},
            availableModels: [],
            defaultModel: "",
            enabled: false,
          }
          : backend
      )),
    })

    const nextDraft = buildDraft()
    const changed = nextDraft.aiBackends.find((backend) => backend.id === "provider:openai")

    expect(changed?.providerType).toBe("openai")
    expect(changed?.endpoint).toBeUndefined()
    expect(changed?.credentials).toEqual({ apiKey: "", oauthAuthFilePath: "" })
    expect(changed?.defaultModel).toBe("")
  })

  it("rejects drafts that enable more than one active ai connection", () => {
    useTempConfig()

    const draft = buildDraft()

    expect(() => saveDraft({
      ...draft,
      aiBackends: draft.aiBackends.map((backend) => (
        backend.id === "provider:openai" || backend.id === "provider:gemini"
          ? {
              ...backend,
              enabled: true,
              defaultModel: backend.id === "provider:openai" ? "gpt-5" : "gemini-2.5-pro",
              credentials: backend.id === "provider:openai"
                ? { apiKey: "sk-test", oauthAuthFilePath: "" }
                : { apiKey: "gemini-key" },
            }
          : backend
      )),
    })).toThrow("Only one active AI connection can be enabled.")
  })

  it("persists the active ai connection and drops legacy multi-provider config", () => {
    const stateDir = useTempConfig()

    const draft = buildDraft()
    saveDraft({
      ...draft,
      aiBackends: draft.aiBackends.map((backend) => (
        backend.id === "provider:openai"
          ? {
            ...backend,
            enabled: true,
            authMode: "chatgpt_oauth",
            endpoint: "https://chatgpt.com/backend-api/codex",
            defaultModel: "gpt-5",
          }
          : backend
      )),
    })

    const raw = parseJsonLike(readFileSync(join(stateDir, "config.json5"), "utf-8"))

    expect(raw.ai?.connection?.provider).toBe("openai")
    expect(raw.ai?.connection?.model).toBe("gpt-5")
    expect(raw.ai?.connection?.endpoint).toBe("https://chatgpt.com/backend-api/codex")
    expect(raw.ai?.connection?.auth?.mode).toBe("chatgpt_oauth")
    expect(raw.ai?.providers).toBeUndefined()
    expect(raw.llm).toBeUndefined()
  })

  it("persists one user name and a separate main agent self-name", () => {
    const stateDir = useTempConfig()

    const draft = buildDraft()
    saveDraft({
      ...draft,
      personal: {
        ...draft.personal,
        profileName: "legacy-profile",
        displayName: "마당쇠",
      },
      mainAgent: {
        name: "노비대장",
      },
    })

    const raw = parseJsonLike(readFileSync(join(stateDir, "config.json5"), "utf-8"))
    const nextDraft = buildDraft()

    expect(raw.profile?.profileName).toBe("마당쇠")
    expect(raw.profile?.displayName).toBe("마당쇠")
    expect(raw.orchestration?.knowbee?.agentName).toBe("노비대장")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("displayName")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("nickname")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("normalizedNickname")
    expect(nextDraft.mainAgent?.name).toBe("노비대장")
  })

  it("preserves an explicit default main-agent alias instead of localizing it", () => {
    const stateDir = useTempConfig()

    const draft = buildDraft()
    saveDraft({
      ...draft,
      personal: {
        ...draft.personal,
        language: "ko",
      },
      mainAgent: {
        name: "Knowbee",
      },
    })

    const raw = parseJsonLike(readFileSync(join(stateDir, "config.json5"), "utf-8"))
    const nextDraft = buildDraft()

    expect(raw.orchestration?.knowbee?.agentName).toBe("Knowbee")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("displayName")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("nickname")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("normalizedNickname")
    expect(nextDraft.mainAgent?.name).toBe("Knowbee")
  })

  it("preserves an explicit main-agent name even when it matches the user profile name", () => {
    const stateDir = useTempConfig()

    const draft = buildDraft()
    saveDraft({
      ...draft,
      personal: {
        ...draft.personal,
        profileName: "마당쇠",
        displayName: "마당쇠",
        language: "ko",
      },
      mainAgent: {
        name: "마당쇠",
      },
    })

    const raw = parseJsonLike(readFileSync(join(stateDir, "config.json5"), "utf-8"))
    const nextDraft = buildDraft()

    expect(raw.profile?.profileName).toBe("마당쇠")
    expect(raw.profile?.displayName).toBe("마당쇠")
    expect(raw.orchestration?.knowbee?.agentName).toBe("마당쇠")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("displayName")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("nickname")
    expect(raw.orchestration?.knowbee).not.toHaveProperty("normalizedNickname")
    expect(nextDraft.mainAgent?.name).toBe("마당쇠")
  })

  it("rebuilds builtin cards from the active single ai connection", () => {
    const stateDir = useTempConfig()

    const draft = buildDraft()
    saveDraft({
      ...draft,
      aiBackends: draft.aiBackends.map((backend) => (
        backend.id === "provider:openai"
          ? {
            ...backend,
            enabled: true,
            authMode: "chatgpt_oauth",
            endpoint: "https://chatgpt.com/backend-api/codex",
            defaultModel: "gpt-5",
          }
          : backend
      )),
    })

    const raw = parseJsonLike(readFileSync(join(stateDir, "config.json5"), "utf-8"))
    raw.ai.connection = {
      provider: "gemini",
      model: "gemini-2.5-pro",
      endpoint: "https://generativelanguage.googleapis.com",
      auth: { apiKey: "gemini-key" },
    }
    writeFileSync(join(stateDir, "config.json5"), JSON.stringify(raw, null, 2), "utf-8")

    const nextDraft = buildDraft()
    const gemini = nextDraft.aiBackends.find((backend) => backend.id === "provider:gemini")
    const openai = nextDraft.aiBackends.find((backend) => backend.id === "provider:openai")

    expect(gemini?.providerType).toBe("gemini")
    expect(gemini?.enabled).toBe(true)
    expect(gemini?.defaultModel).toBe("gemini-2.5-pro")
    expect(openai?.enabled).toBe(false)
  })
})
