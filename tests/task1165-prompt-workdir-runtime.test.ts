import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chdir, cwd } from "node:process"
import { afterEach, describe, expect, it } from "vitest"
import {
  ensurePromptSourceFiles,
  loadPromptTemplate,
} from "../packages/core/src/memory/knowbee-md.ts"
import { registerPromptSourcesRoute } from "../packages/core/src/api/routes/prompt-sources.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import type { SystemPromptDisclosureAuthorizationReceipt } from "../packages/core/src/contracts/system-prompt-disclosure-boundary.ts"

const repoRoot = cwd()
const tempDirs: string[] = []
const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string }): Promise<{
    statusCode: number
    json(): any
  }>
}

function createWorkspace(name: string, systemMarker?: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowbee-task1165-${name}-`))
  tempDirs.push(root)
  if (systemMarker) {
    const promptsDir = join(root, "prompts")
    mkdirSync(promptsDir)
    writeFileSync(join(promptsDir, "system.md"), `# System\n\n${systemMarker}\n`, "utf8")
  }
  return root
}

afterEach(() => {
  chdir(repoRoot)
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("task1165 prompt and request work-directory ownership", () => {
  it("loads from the explicit workspace after the process cwd changes", () => {
    const startupWorkspace = createWorkspace("startup", "startup-workspace-marker")
    const changedWorkspace = createWorkspace("changed", "changed-cwd-marker")

    chdir(changedWorkspace)

    expect(loadPromptTemplate({ sourceId: "system", workDir: startupWorkspace }))
      .toContain("startup-workspace-marker")
    expect(loadPromptTemplate({ sourceId: "system", workDir: startupWorkspace }))
      .not.toContain("changed-cwd-marker")
  })

  it("does not seed prompt files from a changed process cwd", () => {
    const startupWorkspace = createWorkspace("seed-startup")
    const changedWorkspace = createWorkspace("seed-changed", "changed-seed-marker")

    chdir(changedWorkspace)
    const seeded = ensurePromptSourceFiles(startupWorkspace)

    expect(seeded.promptsDir).toBe(join(startupWorkspace, "prompts"))
    expect(readFileSync(join(seeded.promptsDir, "system.md"), "utf8"))
      .not.toContain("changed-seed-marker")
  })

  it("uses the immutable API workspace when request workDir is omitted", async () => {
    const startupWorkspace = createWorkspace("api-startup", "api-startup-marker")
    const changedWorkspace = createWorkspace("api-changed", "api-changed-marker")
    const stateDir = join(createWorkspace("api-state"), "state")
    const config = structuredClone(DEFAULT_CONFIG)
    config.profile.workspace = startupWorkspace
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: stateDir },
      { homeDir: stateDir, exists: () => false },
    )
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, config, paths)
    const now = Date.UTC(2026, 6, 14, 23, 0, 0)
    registerPromptSourcesRoute(app as never, {
      now: () => now,
      resolveAuthorizationReceipt: (authorizationId, context): SystemPromptDisclosureAuthorizationReceipt | undefined => authorizationId === "authorization:task1165" ? {
        schemaVersion: 1, authorizationId, requestId: context.requestId, actorRef: context.actorRef,
        actorCapability: "prompt_reviewer", audienceRef: context.audienceRef, purpose: context.purpose,
        targetSourceRefs: [context.targetSourceRef], sourceSetFingerprint: "sources:task1165",
        redactionMode: "raw_authorized", maxBytes: 1_000_000, maxSegments: 1_000,
        decision: "approved", issuedAt: now, expiresAt: now + 60_000,
      } : undefined,
    })
    await app.ready()

    try {
      chdir(changedWorkspace)
      const response = await app.inject({
        method: "GET",
        url: "/api/prompt-sources?purpose=prompt_review&actor=test:task1165&target=prompt-source-registry&audience=test&redactionMode=raw_authorized&authorizationId=authorization%3Atask1165&requestId=request%3Atask1165",
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().workDir).toBe(startupWorkspace)
      expect(response.json().sources).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceId: "system", path: join(startupWorkspace, "prompts", "system.md") }),
      ]))
      expect(JSON.stringify(response.json())).not.toContain(changedWorkspace)
    } finally {
      await app.close()
    }
  })

  it("keeps request-time prompt and instruction modules free of cwd fallback", () => {
    const targets = [
      "packages/core/src/memory/knowbee-md.ts",
      "packages/core/src/memory/prompt-regression.ts",
      "packages/core/src/api/routes/prompt-sources.ts",
      "packages/core/src/api/routes/config-operations.ts",
      "packages/core/src/api/routes/instructions.ts",
      "packages/core/src/api/routes/topologies.ts",
      "packages/core/src/agent/intake.ts",
      "packages/core/src/agent/main-agent-identity.ts",
      "packages/core/src/orchestration/prompt-bundle.ts",
      "packages/core/src/orchestration/prompt-policy-adapter.ts",
      "packages/core/src/runs/start.ts",
    ]

    for (const relativePath of targets) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8")
      expect(source, relativePath).not.toContain("process.cwd()")
    }
  })

  it("seeds bootstrap prompts from the immutable profile workspace", () => {
    const source = readFileSync(
      join(repoRoot, "packages/core/src/runtime/bootstrap.ts"),
      "utf8",
    )

    expect(source).toContain("ensurePromptSourceFiles(runtimeConfig.profile.workspace)")
    expect(source).not.toContain("ensurePromptSourceFiles(process.cwd())")
  })
})
