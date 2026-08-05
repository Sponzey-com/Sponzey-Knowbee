import { describe, expect, it } from "vitest"
import type { AgentOperationalSettingsProjection } from "../packages/webui/src/contracts/agents.js"
import {
  buildOperationalSettingsMutationRequest,
  createAgentOperationalSettingsDraft,
  operationalPermissionElevation,
  operationalSettingsErrorMessage,
  operationalSettingsSectionDirty,
  validateOperationalSettingsDraft,
} from "../packages/webui/src/lib/agent-operational-settings-draft.js"

const projection: AgentOperationalSettingsProjection = {
  agentRef: `agent_v1_${"a".repeat(24)}`,
  status: "enabled",
  revision: 4,
  model: {
    configured: true,
    availability: "configured",
    providerName: "openai",
    modelName: "gpt-4",
  },
  memory: {
    retentionPolicy: "long_term",
    capsuleMode: "rolling_summary",
    rawWindowSize: 20,
    compactThreshold: 40,
    writebackReviewRequired: true,
    lastCompactedAt: 100,
    capsuleCount: 3,
  },
  permission: {
    riskCeiling: "safe",
    approvalRequiredFrom: "external",
    allowExternalNetwork: false,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPathCount: 2,
  },
  diagnosticCodes: [],
  observedAt: 100,
}

describe("Task 044 operational settings form draft", () => {
  it("initializes from one owner revision without private projection fields", () => {
    const draft = createAgentOperationalSettingsDraft(projection)
    expect(draft).toMatchObject({ agentRef: projection.agentRef, revision: 4 })
    expect(JSON.stringify(draft)).not.toMatch(/owner|allowedPath|profileId|secret|memoryContent/iu)
    expect(operationalSettingsSectionDirty("ai", draft, projection)).toBe(false)
  })

  it("builds model update and explicit clear requests", () => {
    const draft = createAgentOperationalSettingsDraft(projection)
    draft.model.modelName = "gpt-5"
    expect(operationalSettingsSectionDirty("ai", draft, projection)).toBe(true)
    expect(buildOperationalSettingsMutationRequest({ section: "ai", draft })).toEqual({
      kind: "update_model",
      targetRevision: 5,
      value: { providerName: "openai", modelName: "gpt-5" },
    })
    draft.model.configured = false
    expect(buildOperationalSettingsMutationRequest({ section: "ai", draft })).toEqual({
      kind: "clear_model",
      targetRevision: 5,
    })
  })

  it("validates memory integer and compact threshold invariants", () => {
    const draft = createAgentOperationalSettingsDraft(projection)
    draft.memory.rawWindowSize = 40
    draft.memory.compactThreshold = 40
    expect(validateOperationalSettingsDraft("memory", draft)).toBe(
      "memory_compact_threshold_invalid",
    )
    draft.memory.compactThreshold = 41
    expect(validateOperationalSettingsDraft("memory", draft)).toBeNull()
    expect(buildOperationalSettingsMutationRequest({ section: "memory", draft })).toMatchObject({
      kind: "update_memory",
      targetRevision: 5,
      value: { rawWindowSize: 40, compactThreshold: 41 },
    })
  })

  it("detects permission expansion and includes confirmation only when supplied", () => {
    const draft = createAgentOperationalSettingsDraft(projection)
    draft.permission.allowExternalNetwork = true
    expect(operationalSettingsSectionDirty("permissions", draft, projection)).toBe(true)
    expect(operationalPermissionElevation(draft, projection)).toBe(true)
    expect(
      buildOperationalSettingsMutationRequest({
        section: "permissions",
        draft,
        confirmElevation: true,
      }),
    ).toMatchObject({ kind: "update_permission", targetRevision: 5, confirmElevation: true })
  })

  it("maps server reasons to concise user actions without echoing raw details", () => {
    const text = (ko: string) => ko
    expect(
      operationalSettingsErrorMessage(
        new Error("409 conflict: mutation_revision_conflict / internal:/private/path"),
        text,
      ),
    ).toBe("다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 확인해 주세요.")
    expect(
      operationalSettingsErrorMessage(new Error("unknown internal:/private/path"), text),
    ).not.toContain("/private/path")
  })
})
