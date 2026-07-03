import { readdirSync, readFileSync } from "node:fs"
import { basename } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  answerMainAgentSelfNameQuestion,
  buildMainAgentIdentityPromptContext,
  buildMainAgentPromptVariables,
  resolveMainAgentSelfName,
  resolvePromptLocaleForRequest,
} from "../packages/core/src/agent/main-agent-identity.ts"
import { loadPromptSourceRegistry, loadPromptTemplate } from "../packages/core/src/memory/knowbee-md.ts"

describe("main agent file-backed prompt identity", () => {
  it("renders the configured main-agent self name into the file-backed system prompt", () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, language: "ko" },
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        knowbee: {
          schemaVersion: 1,
          agentType: "knowbee" as const,
          agentId: "agent:knowbee",
          displayName: "마당쇠",
          nickname: "마당쇠",
          normalizedNickname: "마당쇠",
          status: "enabled" as const,
          role: "Main assistant",
          personality: "Concise",
          specialtyTags: [],
          avoidTasks: [],
          memoryPolicy: {
            owner: { ownerType: "knowbee" as const, ownerId: "agent:knowbee" },
            visibility: "private" as const,
            readScopes: [{ ownerType: "knowbee" as const, ownerId: "agent:knowbee" }],
            writeScope: { ownerType: "knowbee" as const, ownerId: "agent:knowbee" },
            retentionPolicy: "long_term" as const,
            writebackReviewRequired: false,
          },
          capabilityPolicy: {
            permissionProfile: {
              profileId: "profile:knowbee-main",
              riskCeiling: "moderate" as const,
              approvalRequiredFrom: "moderate" as const,
              allowExternalNetwork: true,
              allowFilesystemWrite: false,
              allowShellExecution: false,
              allowScreenControl: false,
              allowedPaths: [],
            },
            skillMcpAllowlist: {
              enabledSkillIds: [],
              enabledMcpServerIds: [],
              enabledToolNames: [],
              disabledToolNames: [],
              secretScopeId: "agent:knowbee",
            },
            rateLimit: { maxConcurrentCalls: 1 },
          },
          profileVersion: 1,
          createdAt: 1,
          updatedAt: 1,
          coordinator: {
            defaultMode: "single_knowbee" as const,
            fallbackMode: "single_knowbee" as const,
            maxDelegatedSubSessions: 1,
          },
        },
      },
    }

    const context = buildMainAgentIdentityPromptContext(config)
    const prompt = loadPromptTemplate({
      sourceId: "system",
      workDir: process.cwd(),
      locale: "en",
      variables: buildMainAgentPromptVariables(config),
    })

    expect(context).toContain("Current main-agent self name: 마당쇠")
    expect(prompt).toContain("You are 마당쇠.")
    expect(prompt).toContain("Current main-agent self name: `마당쇠`")
    expect(prompt).not.toContain("You are Knowbee.")
  })

  it("localizes the default self name for Korean name questions", () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, language: "en" },
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        knowbee: {
          ...DEFAULT_CONFIG.orchestration.knowbee,
          schemaVersion: 1,
          agentType: "knowbee" as const,
          agentId: "agent:knowbee",
          displayName: "Knowbee",
          nickname: "Knowbee",
          normalizedNickname: "knowbee",
          status: "enabled" as const,
          role: "Main assistant",
          personality: "Concise",
          specialtyTags: [],
          avoidTasks: [],
          memoryPolicy: {
            owner: { ownerType: "knowbee" as const, ownerId: "agent:knowbee" },
            visibility: "private" as const,
            readScopes: [{ ownerType: "knowbee" as const, ownerId: "agent:knowbee" }],
            writeScope: { ownerType: "knowbee" as const, ownerId: "agent:knowbee" },
            retentionPolicy: "long_term" as const,
            writebackReviewRequired: false,
          },
          capabilityPolicy: {
            permissionProfile: {
              profileId: "profile:knowbee-main",
              riskCeiling: "moderate" as const,
              approvalRequiredFrom: "moderate" as const,
              allowExternalNetwork: true,
              allowFilesystemWrite: false,
              allowShellExecution: false,
              allowScreenControl: false,
              allowedPaths: [],
            },
            skillMcpAllowlist: {
              enabledSkillIds: [],
              enabledMcpServerIds: [],
              enabledToolNames: [],
              disabledToolNames: [],
              secretScopeId: "agent:knowbee",
            },
            rateLimit: { maxConcurrentCalls: 1 },
          },
          profileVersion: 1,
          createdAt: 1,
          updatedAt: 1,
          coordinator: {
            defaultMode: "single_knowbee" as const,
            fallbackMode: "single_knowbee" as const,
            maxDelegatedSubSessions: 1,
          },
        },
      },
    }
    const promptLocale = resolvePromptLocaleForRequest(config.profile.language, "니 이름이 뭐니?")
    const prompt = loadPromptTemplate({
      sourceId: "system",
      workDir: process.cwd(),
      locale: promptLocale,
      variables: buildMainAgentPromptVariables(config, promptLocale),
    })

    expect(promptLocale).toBe("ko")
    expect(resolveMainAgentSelfName(config, promptLocale)).toBe("노비")
    expect(buildMainAgentIdentityPromptContext(config, promptLocale)).toContain("Current main-agent self name: 노비")
    expect(prompt).toContain("You are 노비.")
    expect(prompt).not.toContain("You are Knowbee.")
  })

  it("routes only assistant self-name questions through the deterministic answer", () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, language: "ko" },
    }

    expect(answerMainAgentSelfNameQuestion(config, "니 이름이 뭐니?")).toBe("제 이름은 노비입니다.")
    expect(answerMainAgentSelfNameQuestion(config, "내 이름이 뭐니?")).toBeNull()
  })

  it("does not treat the user's profile name as the main agent self-name", () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: {
        ...DEFAULT_CONFIG.profile,
        profileName: "마당쇠",
        displayName: "마당쇠",
        language: "ko",
      },
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        knowbee: {
          ...DEFAULT_CONFIG.orchestration.knowbee,
          schemaVersion: 1,
          agentType: "knowbee" as const,
          agentId: "agent:knowbee",
          displayName: "마당쇠",
          nickname: "마당쇠",
          normalizedNickname: "마당쇠",
          status: "enabled" as const,
          role: "Main assistant",
          personality: "Concise",
          specialtyTags: [],
          avoidTasks: [],
          memoryPolicy: {
            owner: { ownerType: "knowbee" as const, ownerId: "agent:knowbee" },
            visibility: "private" as const,
            readScopes: [{ ownerType: "knowbee" as const, ownerId: "agent:knowbee" }],
            writeScope: { ownerType: "knowbee" as const, ownerId: "agent:knowbee" },
            retentionPolicy: "long_term" as const,
            writebackReviewRequired: false,
          },
          capabilityPolicy: {
            permissionProfile: {
              profileId: "profile:knowbee-main",
              riskCeiling: "moderate" as const,
              approvalRequiredFrom: "moderate" as const,
              allowExternalNetwork: true,
              allowFilesystemWrite: false,
              allowShellExecution: false,
              allowScreenControl: false,
              allowedPaths: [],
            },
            skillMcpAllowlist: {
              enabledSkillIds: [],
              enabledMcpServerIds: [],
              enabledToolNames: [],
              disabledToolNames: [],
              secretScopeId: "agent:knowbee",
            },
            rateLimit: { maxConcurrentCalls: 1 },
          },
          profileVersion: 1,
          createdAt: 1,
          updatedAt: 1,
          coordinator: {
            defaultMode: "single_knowbee" as const,
            fallbackMode: "single_knowbee" as const,
            maxDelegatedSubSessions: 1,
          },
        },
      },
    }

    expect(resolveMainAgentSelfName(config, "ko")).toBe("노비")
    expect(answerMainAgentSelfNameQuestion(config, "니 이름이 뭐니?")).toBe("제 이름은 노비입니다.")
  })

  it("keeps active prompt bodies out of runtime source code", () => {
    const files = [
      "packages/core/src/agent/index.ts",
      "packages/core/src/agent/intake-prompt.ts",
      "packages/core/src/agent/completion-review.ts",
      "packages/core/src/runs/entry-comparison.ts",
      "packages/core/src/runs/intake-bridge-pass.ts",
      "packages/core/src/runs/web-retrieval-planner.ts",
      "packages/core/src/schedules/comparison.ts",
      "packages/core/src/topology/node-definition-suggestion.ts",
      "packages/core/src/api/routes/settings.ts",
      "packages/core/src/memory/knowbee-md.ts",
    ]

    const forbidden = [
      "You are Knowbee.",
      "You are Knowbee's task intake",
      "You are Knowbee's completion reviewer",
      "You are Knowbee's isolated request-continuation classifier",
      "You are Knowbee's execution-decision harness",
      "You are Knowbee's isolated schedule-contract comparator",
      "You are helping a user define an executor node",
      "You are a connection test",
      "# Task Intake Prompt",
      "# Completion Review Prompt",
      "# Request Continuation Prompt",
      "# Web Retrieval Recovery Planner",
    ]

    for (const file of files) {
      const content = readFileSync(file, "utf-8")
      for (const marker of forbidden) {
        expect(content, `${file} must not contain ${marker}`).not.toContain(marker)
      }
    }
  })

  it("keeps repository prompt markdown files registered without orphan files", () => {
    const promptFiles = readdirSync("prompts")
      .filter((filename) => filename.endsWith(".md"))
      .sort()
    const registeredFiles = loadPromptSourceRegistry(process.cwd())
      .map((source) => basename(source.path))
      .sort()

    expect(registeredFiles).toEqual(promptFiles)
  })
})
