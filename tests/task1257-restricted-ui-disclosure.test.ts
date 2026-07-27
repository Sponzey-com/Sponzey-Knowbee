import { describe, expect, it } from "vitest"
import {
  authorizeRestrictedUiDisclosure,
  projectOrdinaryUi,
  type RawSystemPromptDisclosurePurpose,
  type SystemPromptDisclosureAuthorizationReceipt,
} from "../packages/core/src/index.ts"

const now = 100

function receipt(
  purpose: RawSystemPromptDisclosurePurpose,
  overrides: Partial<SystemPromptDisclosureAuthorizationReceipt & {
    surface: "admin_prompt_review" | "field_debug" | "prompt_improvement_review"
    contentKind: "system_prompt" | "agent_persona"
    targetAgentRef: string
  }> = {},
) {
  const capability = purpose === "administrator_debug"
    ? "administrator"
    : purpose === "security_or_audit_validation"
      ? "security_auditor"
      : "prompt_reviewer"
  return {
    schemaVersion: 1 as const,
    authorizationId: "authorization:1",
    requestId: "request:1",
    actorRef: "actor:1",
    actorCapability: capability as "administrator" | "security_auditor" | "prompt_reviewer",
    audienceRef: "audience:1",
    purpose,
    targetSourceRefs: ["prompt:identity"],
    sourceSetFingerprint: "sources:v1",
    redactionMode: "redacted" as const,
    maxBytes: 2048,
    maxSegments: 2,
    decision: "approved" as const,
    issuedAt: 90,
    expiresAt: 110,
    surface: "prompt_improvement_review" as const,
    contentKind: "system_prompt" as const,
    targetAgentRef: "agent:reviewed",
    ...overrides,
  }
}

function authorize(overrides: Record<string, unknown> = {}) {
  const purpose = "prompt_review_or_improvement" as const
  return authorizeRestrictedUiDisclosure({
    surface: "prompt_improvement_review",
    contentKind: "system_prompt",
    requestId: "request:1",
    actorRef: "actor:1",
    audienceRef: "audience:1",
    requestedPurpose: purpose,
    requestedSourceRefs: ["prompt:identity"],
    expectedSourceSetFingerprint: "sources:v1",
    receipt: receipt(purpose),
    now,
    ...overrides,
  })
}

describe("task1257 restricted UI disclosure", () => {
  it("projects only user-facing identity, status, reason, and next action", () => {
    expect(projectOrdinaryUi({
      agentName: "마당쇠",
      statusLabel: "실행 중",
      actionableReason: "사용자 확인을 기다립니다.",
      nextAction: "승인 또는 거절을 선택하세요.",
      description: "ignored secondary value",
    })).toEqual({
      status: "projected",
      projection: {
        agentName: "마당쇠",
        statusLabel: "실행 중",
        actionableReason: "사용자 확인을 기다립니다.",
        nextAction: "승인 또는 거절을 선택하세요.",
      },
    })
  })

  it.each([
    "agentId",
    "session_id",
    "runId",
    "requestGroupId",
    "rawState",
    "stateMachineEvent",
    "systemPrompt",
    "promptContent",
    "persona",
    "trait",
    "workspacePath",
  ])("rejects forbidden ordinary UI field %s", (field) => {
    expect(projectOrdinaryUi({ agentName: "마당쇠", statusLabel: "준비", [field]: "secret" })).toEqual({
      status: "rejected",
      reasonCode: "ordinary_ui_forbidden_field",
    })
  })

  it("returns summary-only for raw prompt or persona requests from ordinary UI", () => {
    expect(authorizeRestrictedUiDisclosure({
      surface: "ordinary_ui",
      contentKind: "system_prompt",
      requestId: "",
      actorRef: "",
      audienceRef: "",
      requestedPurpose: "prompt_review_or_improvement",
      requestedSourceRefs: [],
      expectedSourceSetFingerprint: "",
      now,
    })).toEqual({ status: "summary_only", projection: "behavior_policy_summary" })
  })

  it("authorizes only an exact restricted prompt review receipt", () => {
    expect(authorize()).toEqual(expect.objectContaining({
      status: "authorized",
      authorizationId: "authorization:1",
      targetSourceRefs: ["prompt:identity"],
    }))
  })

  it("rejects a mismatched restricted surface or content kind", () => {
    expect(authorize({ surface: "field_debug" })).toEqual({
      status: "blocked",
      reasonCode: "authorization_scope_mismatch",
    })
    expect(authorize({ contentKind: "agent_persona" })).toEqual({
      status: "blocked",
      reasonCode: "authorization_scope_mismatch",
    })
  })

  it("requires administrator capability and exact agent scope for persona content", () => {
    const personaReceipt = receipt("administrator_debug", {
      surface: "admin_prompt_review",
      contentKind: "agent_persona",
      targetAgentRef: "agent:reviewed",
    })
    const base = {
      surface: "admin_prompt_review" as const,
      contentKind: "agent_persona" as const,
      requestId: "request:1",
      actorRef: "actor:1",
      audienceRef: "audience:1",
      requestedPurpose: "administrator_debug" as const,
      requestedSourceRefs: ["prompt:persona"],
      expectedSourceSetFingerprint: "sources:v1",
      requestedAgentRef: "agent:reviewed",
      receipt: { ...personaReceipt, targetSourceRefs: ["prompt:persona"] },
      now,
    }
    expect(authorizeRestrictedUiDisclosure(base).status).toBe("authorized")
    expect(authorizeRestrictedUiDisclosure({ ...base, requestedAgentRef: "agent:other" })).toEqual({
      status: "blocked",
      reasonCode: "authorization_scope_mismatch",
    })
  })
})
