import { describe, expect, it } from "vitest"
import { buildAgentOperationalSettingsProjection } from "../packages/core/src/agents/agent-operational-settings-projection.js"

const agentRef = `agent_v1_${"a".repeat(24)}`

function source() {
  return {
    agentRef,
    status: "enabled" as const,
    profileVersion: 7,
    modelProfile: {
      providerId: "openai",
      modelId: "gpt-5",
      effort: "high",
      fallbackModelId: "gpt-5-mini",
    },
    memoryPolicy: {
      owner: { ownerType: "sub_agent", ownerId: "private-agent-id" },
      visibility: "private",
      readScopes: [{ ownerType: "sub_agent", ownerId: "private-agent-id" }],
      writeScope: { ownerType: "sub_agent", ownerId: "private-agent-id" },
      retentionPolicy: "long_term",
      writebackReviewRequired: true,
      rawWindowSize: 24,
      compactThreshold: 40,
      capsuleMode: "rolling_summary",
      archiveReferenceMode: "summary_reference",
      handoffCapsuleAllowed: false,
      lastCompactedAt: 900,
      capsuleCount: 3,
    },
    permissionProfile: {
      profileId: "private-permission-profile",
      riskCeiling: "sensitive",
      approvalRequiredFrom: "external",
      allowExternalNetwork: true,
      allowFilesystemWrite: false,
      allowShellExecution: false,
      allowScreenControl: true,
      allowedPaths: ["/Users/private/project", "/private/secret"],
    },
    secretScopeId: "secret:private",
    observedAt: 1_000,
  }
}

describe("Task 042 agent operational settings projection", () => {
  it("projects model, compact memory and permission summaries without private fields", () => {
    const projection = buildAgentOperationalSettingsProjection(source())
    expect(projection).toMatchObject({
      agentRef,
      status: "enabled",
      revision: 7,
      model: {
        configured: true,
        providerName: "openai",
        modelName: "gpt-5",
        effort: "high",
        fallbackModelName: "gpt-5-mini",
      },
      memory: {
        retentionPolicy: "long_term",
        capsuleMode: "rolling_summary",
        rawWindowSize: 24,
        compactThreshold: 40,
        writebackReviewRequired: true,
        lastCompactedAt: 900,
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
    })
    expect(JSON.stringify(projection)).not.toMatch(
      /private-agent-id|private-permission-profile|\/Users\/private|\/private\/secret|secret:private|owner|readScopes|writeScope|allowedPaths|profileId|secretScope/iu,
    )
  })

  it("keeps an unconfigured model explicit", () => {
    const projection = buildAgentOperationalSettingsProjection({
      ...source(),
      modelProfile: undefined,
    })
    expect(projection.model).toEqual({ configured: false, availability: "unavailable" })
    expect(projection.diagnosticCodes).toContain("agent_model_unconfigured")
  })

  it("fails closed on invalid enum and numeric values without echoing raw input", () => {
    const projection = buildAgentOperationalSettingsProjection({
      ...source(),
      modelProfile: { providerId: "", modelId: "unsafe-model-value", effort: 123 },
      memoryPolicy: {
        ...source().memoryPolicy,
        retentionPolicy: "forever",
        capsuleMode: "unsafe-mode",
        rawWindowSize: -10,
        compactThreshold: Number.NaN,
      },
      permissionProfile: {
        ...source().permissionProfile,
        riskCeiling: "superuser",
        approvalRequiredFrom: "never",
        allowedPaths: "raw-private-path",
      },
    } as never)
    expect(projection.model).toEqual({ configured: false, availability: "unavailable" })
    expect(projection.memory).toMatchObject({
      retentionPolicy: "session",
      capsuleMode: "session_compaction",
      rawWindowSize: null,
      compactThreshold: null,
    })
    expect(projection.permission).toMatchObject({
      riskCeiling: "safe",
      approvalRequiredFrom: "safe",
      allowedPathCount: 0,
    })
    expect(projection.diagnosticCodes).toEqual(
      expect.arrayContaining([
        "agent_model_profile_invalid",
        "agent_memory_policy_invalid",
        "agent_permission_profile_invalid",
      ]),
    )
    expect(JSON.stringify(projection)).not.toMatch(
      /unsafe-model-value|forever|unsafe-mode|superuser|raw-private-path/iu,
    )
  })

  it("rejects invalid public references and revisions", () => {
    expect(() =>
      buildAgentOperationalSettingsProjection({ ...source(), agentRef: "agent:private" }),
    ).toThrow("agent_settings_public_ref_invalid")
    expect(() =>
      buildAgentOperationalSettingsProjection({ ...source(), profileVersion: -1 }),
    ).toThrow("agent_settings_revision_invalid")
  })
})
