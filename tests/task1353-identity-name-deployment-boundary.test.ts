import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeIdentityNameMutation,
  executeAuthorizedIdentityNameMutation,
} from "../packages/core/src/agent/identity-name-mutation-authorization.ts"
import {
  authorizeImprovementMutation,
  executeAuthorizedImprovementMutation,
} from "../packages/core/src/memory/improvement-mutation-boundary.ts"

const now = Date.UTC(2026, 6, 14)

function nameDecision(target: "main_agent_name" | "user_name") {
  return authorizeIdentityNameMutation({
    requestedTarget: target,
    intent: { requestId: `request:${target}`, requester: "user:owner", requesterType: "user", target, requestedAt: now - 1, expiresAt: now + 1000 },
    now,
  })
}

describe("task1353 identity-name and deployment boundaries", () => {
  it.each(["main_agent_name", "user_name"] as const)("authorizes only an explicitly targeted name mutation: %s", (target) => {
    expect(nameDecision(target)).toEqual({ status: "authorized", target, requestId: `request:${target}` })
  })

  it("blocks a name change without explicit name-target intent", () => {
    expect(authorizeIdentityNameMutation({ requestedTarget: "main_agent_name", now })).toEqual({
      status: "blocked", reasonCode: "explicit_name_target_missing",
    })
  })

  it("prevents main-agent name authorization from invoking the user-name writer", async () => {
    const write = vi.fn(async () => "unexpected")
    await expect(executeAuthorizedIdentityNameMutation({ decision: nameDecision("main_agent_name"), writerTarget: "user_name", write }))
      .resolves.toEqual({ status: "blocked", reasonCode: "name_target_mismatch" })
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    "scripts/deploy.sh",
    "SCRIPTS\\RELEASE-WINDOWS.BAT",
    "scripts/installer.ps1",
    "packages/cli/scripts/package.mjs",
  ])("blocks canonical deployment script before mutation: %s", async (requestedRef) => {
    const canonicalWorkspacePath = requestedRef.replace(/\\/gu, "/").toLocaleLowerCase()
    const decision = authorizeImprovementMutation({
      target: { targetKind: "file", requestedRef, canonicalWorkspacePath, withinWorkspace: true, traversedSymlink: false, sourceAuthorization: "prompt_source" },
      runtimeSnapshot: { snapshotId: "startup:v1", capturedAt: now },
    })
    const mutate = vi.fn()
    expect(decision).toEqual({ status: "blocked", reasonCode: "deployment_script_forbidden" })
    await expect(executeAuthorizedImprovementMutation({ decision, mutate })).resolves.toEqual(decision)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("keeps name authorization independent from profile storage and environment", () => {
    const source = readFileSync(new URL("../packages/core/src/agent/identity-name-mutation-authorization.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|openai|@anthropic-ai\/sdk)/u)
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|globalThis|fetch\(/u)
  })
})
