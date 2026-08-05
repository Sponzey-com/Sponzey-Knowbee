import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerInstructionsRoute } from "../packages/core/src/api/routes/instructions.ts"
import type { SystemPromptDisclosureAuthorizationReceipt } from "../packages/core/src/contracts/system-prompt-disclosure-boundary.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): any
  }>
}

const tempDirs: string[] = []
const disclosureNow = Date.UTC(2026, 6, 14, 22, 30, 0)

function disclosureReceiptResolver(
  authorizationId: string,
  context: { requestId: string; actorRef: string; audienceRef: string; purpose: "prompt_review_or_improvement" | "administrator_debug" | "security_or_audit_validation"; targetSourceRef: string },
): SystemPromptDisclosureAuthorizationReceipt | undefined {
  if (authorizationId !== "authorization:test") return undefined
  return {
    schemaVersion: 1, authorizationId, requestId: context.requestId, actorRef: context.actorRef,
    actorCapability: context.purpose === "prompt_review_or_improvement" ? "prompt_reviewer" : context.purpose === "administrator_debug" ? "administrator" : "security_auditor",
    audienceRef: context.audienceRef, purpose: context.purpose, targetSourceRefs: [context.targetSourceRef],
    sourceSetFingerprint: "instructions:test", redactionMode: "raw_authorized", maxBytes: 1_000_000,
    maxSegments: 1_000, decision: "approved", issuedAt: disclosureNow, expiresAt: disclosureNow + 60_000,
  }
}

function createInstructionFixture(): { root: string; stateDir: string; repoDir: string } {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task0323-instructions-"))
  tempDirs.push(root)
  const stateDir = join(root, "state")
  const repoDir = join(root, "repo")
  mkdirSync(stateDir, { recursive: true })
  mkdirSync(join(repoDir, ".git"), { recursive: true })
  writeFileSync(join(stateDir, "AGENTS.md"), "global hidden instruction text", "utf-8")
  writeFileSync(join(repoDir, "AGENTS.md"), "repo hidden instruction text", "utf-8")
  return { root, stateDir, repoDir }
}

function installInstructionRuntime(app: ReturnType<typeof Fastify>, stateDir: string, workspace: string): void {
  const config = structuredClone(DEFAULT_CONFIG)
  config.profile.workspace = workspace
  const paths = createRuntimePaths(
    { KNOWBEE_STATE_DIR: stateDir },
    { homeDir: stateDir, exists: () => false },
  )
  installApiRuntimeConfig(app as never, config, paths)
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0323 active instructions disclosure gate", () => {
  it("blocks active instructions reads without an authorized disclosure contract", async () => {
    const { stateDir, repoDir } = createInstructionFixture()
    const app = Fastify({ logger: false })
    installInstructionRuntime(app, stateDir, repoDir)
    registerInstructionsRoute(app, { resolveAuthorizationReceipt: disclosureReceiptResolver, now: () => disclosureNow })
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/instructions/active?workDir=${encodeURIComponent(repoDir)}`,
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        error: "active_instructions_disclosure_not_authorized",
        issues: expect.arrayContaining([
          "purpose_missing_or_invalid",
          "actor_missing",
          "audience_missing",
          "redaction_mode_missing_or_invalid",
        ]),
      })
    } finally {
      await app.close()
    }
  })

  it("redacts active instructions text and paths for authorized redacted disclosure reads", async () => {
    const { root, stateDir, repoDir } = createInstructionFixture()
    const app = Fastify({ logger: false })
    installInstructionRuntime(app, stateDir, repoDir)
    registerInstructionsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/instructions/active?workDir=${encodeURIComponent(repoDir)}&purpose=audit&actor=test:audit&audience=auditor&redactionMode=redacted`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        workDir: "[internal-path-redacted]",
        gitRoot: "[internal-path-redacted]",
        disclosure: {
          purpose: "audit",
          actor: "test:audit",
          target: "active-instructions",
          audience: "auditor",
          redactionMode: "redacted",
          state: "redacted",
        },
        mergedText: "[merged-instructions-redacted]",
        sources: [
          expect.objectContaining({ path: "[internal-path-redacted]" }),
          expect.objectContaining({ path: "[internal-path-redacted]" }),
        ],
      })
      expect(JSON.stringify(response.json())).not.toContain(root)
      expect(JSON.stringify(response.json())).not.toContain("global hidden instruction text")
      expect(JSON.stringify(response.json())).not.toContain("repo hidden instruction text")
    } finally {
      await app.close()
    }
  })

  it("blocks raw active instructions disclosure without the expected target", async () => {
    const { stateDir, repoDir } = createInstructionFixture()
    const app = Fastify({ logger: false })
    installInstructionRuntime(app, stateDir, repoDir)
    registerInstructionsRoute(app)
    await app.ready()
    try {
      const missingTarget = await app.inject({
        method: "GET",
        url: `/api/instructions/active?workDir=${encodeURIComponent(repoDir)}&purpose=prompt_review&actor=webui-active-instructions-panel&audience=authorized-user&redactionMode=raw_authorized`,
      })

      expect(missingTarget.statusCode).toBe(403)
      expect(missingTarget.json()).toMatchObject({
        error: "active_instructions_disclosure_not_authorized",
        issues: expect.arrayContaining(["target_missing"]),
      })

      const wrongTarget = await app.inject({
        method: "GET",
        url: `/api/instructions/active?workDir=${encodeURIComponent(repoDir)}&purpose=prompt_review&actor=webui-active-instructions-panel&target=prompt-source-registry&audience=authorized-user&redactionMode=raw_authorized`,
      })

      expect(wrongTarget.statusCode).toBe(403)
      expect(wrongTarget.json()).toMatchObject({
        error: "active_instructions_disclosure_not_authorized",
        issues: expect.arrayContaining(["target_mismatch"]),
      })
    } finally {
      await app.close()
    }
  })

  it("returns active instructions only for authorized raw disclosure reads", async () => {
    const { root, stateDir, repoDir } = createInstructionFixture()
    const app = Fastify({ logger: false })
    installInstructionRuntime(app, stateDir, repoDir)
    registerInstructionsRoute(app, { resolveAuthorizationReceipt: disclosureReceiptResolver, now: () => disclosureNow })
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/instructions/active?workDir=${encodeURIComponent(repoDir)}&purpose=prompt_review&actor=webui-active-instructions-panel&target=active-instructions&audience=authorized-user&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        workDir: repoDir,
        gitRoot: repoDir,
        disclosure: {
          purpose: "prompt_review",
          actor: "webui-active-instructions-panel",
          target: "active-instructions",
          audience: "authorized-user",
          redactionMode: "raw_authorized",
          state: "raw_authorized",
        },
      })
      expect(response.json().mergedText).toContain("global hidden instruction text")
      expect(response.json().mergedText).toContain("repo hidden instruction text")
      expect(response.json().sources[0].path).toContain(root)
    } finally {
      await app.close()
    }
  })
})
