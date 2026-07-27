import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeSystemPromptDisclosure,
  deliverAuthorizedSystemPrompt,
  RAW_SYSTEM_PROMPT_DISCLOSURE_PURPOSES,
  type RawSystemPromptDisclosurePurpose,
  type SystemPromptDisclosureAuthorizationReceipt,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 21, 0, 0)
const capability = {
  prompt_review_or_improvement: "prompt_reviewer",
  administrator_debug: "administrator",
  security_or_audit_validation: "security_auditor",
} as const

function receipt(purpose: RawSystemPromptDisclosurePurpose, overrides: Partial<SystemPromptDisclosureAuthorizationReceipt> = {}): SystemPromptDisclosureAuthorizationReceipt {
  return {
    schemaVersion: 1, authorizationId: "authorization:1", requestId: "request:1", actorRef: "actor:owner",
    actorCapability: capability[purpose], audienceRef: "audience:owner", purpose, targetSourceRefs: ["prompt:identity"],
    sourceSetFingerprint: "sources:v1", redactionMode: "raw_authorized", maxBytes: 2048, maxSegments: 4,
    decision: "approved", issuedAt: now, expiresAt: now + 60_000, ...overrides,
  }
}

function authorize(purpose: RawSystemPromptDisclosurePurpose = "prompt_review_or_improvement", overrides: Record<string, unknown> = {}) {
  return authorizeSystemPromptDisclosure({
    surface: "authorized_workflow", requestId: "request:1", actorRef: "actor:owner", audienceRef: "audience:owner",
    requestedPurpose: purpose, requestedSourceRefs: ["prompt:identity"], expectedSourceSetFingerprint: "sources:v1",
    receipt: receipt(purpose), now, ...overrides,
  })
}

describe("task1237 system prompt disclosure boundary", () => {
  it.each(["ordinary_conversation", "ordinary_ui", "ordinary_execution_report"] as const)(
    "returns only a behavior summary for %s", (surface) => {
      expect(authorizeSystemPromptDisclosure({ surface, requestId: "", actorRef: "", audienceRef: "", now })).toEqual({
        status: "summary_only", projection: "behavior_policy_summary",
      })
    },
  )

  it("defines exactly the three authorized workflow purposes", () => {
    expect(RAW_SYSTEM_PROMPT_DISCLOSURE_PURPOSES).toEqual([
      "prompt_review_or_improvement", "administrator_debug", "security_or_audit_validation",
    ])
  })

  it.each(RAW_SYSTEM_PROMPT_DISCLOSURE_PURPOSES)("authorizes exact scoped receipt for %s", (purpose) => {
    expect(authorize(purpose)).toMatchObject({ status: "authorized", authorizationId: "authorization:1", targetSourceRefs: ["prompt:identity"] })
  })

  it.each([
    [{ receipt: undefined }, "authorization_missing"],
    [{ receipt: receipt("prompt_review_or_improvement", { decision: "denied" }) }, "authorization_denied"],
    [{ receipt: receipt("prompt_review_or_improvement", { expiresAt: now }) }, "authorization_expired"],
    [{ actorRef: "actor:other" }, "authorization_scope_mismatch"],
    [{ audienceRef: "audience:other" }, "authorization_scope_mismatch"],
    [{ requestedSourceRefs: ["prompt:other"] }, "authorization_scope_mismatch"],
    [{ requestedSourceRefs: ["prompt:*"] }, "target_invalid"],
    [{ receipt: receipt("prompt_review_or_improvement", { actorCapability: "administrator" }) }, "actor_capability_mismatch"],
  ] as const)("rejects invalid disclosure authorization %o", (change, reasonCode) => {
    expect(authorize("prompt_review_or_improvement", change)).toEqual({ status: "blocked", reasonCode })
  })

  it("enforces source fingerprint and bounded delivery before callback", async () => {
    const deliver = vi.fn(async () => "content")
    await expect(deliverAuthorizedSystemPrompt({ decision: authorize(), actualSourceSetFingerprint: "sources:old", contentBytes: 10, contentSegments: 1, deliver })).resolves.toEqual({ status: "blocked", reasonCode: "authorization_scope_mismatch" })
    await expect(deliverAuthorizedSystemPrompt({ decision: authorize(), actualSourceSetFingerprint: "sources:v1", contentBytes: 4096, contentSegments: 1, deliver })).resolves.toEqual({ status: "blocked", reasonCode: "delivery_limit_invalid" })
    await expect(deliverAuthorizedSystemPrompt({
      decision: authorize("prompt_review_or_improvement", {
        receipt: receipt("prompt_review_or_improvement", { redactionMode: "redacted" }),
      }),
      actualSourceSetFingerprint: "sources:v1",
      contentBytes: 100,
      contentSegments: 1,
      deliver,
    })).resolves.toEqual({ status: "blocked", reasonCode: "raw_disclosure_not_authorized" })
    expect(deliver).not.toHaveBeenCalled()
    await expect(deliverAuthorizedSystemPrompt({ decision: authorize(), actualSourceSetFingerprint: "sources:v1", contentBytes: 100, contentSegments: 1, deliver })).resolves.toEqual({ status: "delivered", result: "content" })
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it("keeps disclosure policy independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/system-prompt-disclosure-boundary.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
