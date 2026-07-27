import { createRequire } from "node:module"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { ARTIFACT_CLEANUP_CONFIRMATION } from "../packages/core/src/release/artifact-retention.ts"
import { closeDb, getDb, insertAuditLog } from "../packages/core/src/db/index.js"
import { createTestRuntimeConfigFixture, type TestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; body: string; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function touchOld(path: string): void {
  const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000)
  utimesSync(path, old, old)
}

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task091-artifact-cleanup-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task091 artifact cleanup boundary", () => {
  it("previews and executes artifact cleanup without exposing paths or file names", async () => {
    const stateDir = runtimeFixture.paths.stateDir
    const adminExports = join(stateDir, "admin-exports")
    const signingRequests = join(stateDir, "release", "live-acceptance-signing-requests")
    mkdirSync(adminExports, { recursive: true })
    mkdirSync(signingRequests, { recursive: true })
    const oldAdmin = join(adminExports, "admin-export-private-operation.json")
    const freshAdmin = join(adminExports, "admin-export-fresh.json")
    const oldSigning = join(signingRequests, `${"b".repeat(64)}-${"a".repeat(64)}.json`)
    const skippedTarget = join(signingRequests, "nested")
    const skippedLink = join(signingRequests, "linked.json")
    writeFileSync(oldAdmin, "yeonjang-goal-validation:private operationId=operation:private\n", "utf8")
    writeFileSync(freshAdmin, "fresh\n", "utf8")
    writeFileSync(oldSigning, JSON.stringify({ operationId: "operation:private" }), "utf8")
    mkdirSync(skippedTarget)
    symlinkSync(oldSigning, skippedLink)
    touchOld(oldAdmin)
    touchOld(oldSigning)

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, {
      uiModeRuntime: {
        adminActivation: {
          env: { KNOWBEE_ADMIN_UI: "1" },
          nodeEnv: undefined,
        },
      },
    })
    await app.ready()
    try {
      const previewResponse = await app.inject({
        method: "GET",
        url: "/api/admin/artifact-cleanup/preview?maxAgeMs=1000",
      })
      expect(previewResponse.statusCode).toBe(200)
      const previewText = previewResponse.body
      expect(previewText).toContain("knowbee.artifact_cleanup.preview")
      expect(previewResponse.json().display).toEqual(expect.objectContaining({
        kind: "knowbee.artifact_cleanup.user_projection",
        confirmed: null,
      }))
      expect(JSON.stringify(previewResponse.json().display)).not.toMatch(/unsafe_symlink|package_path_invalid|manifest_marker_missing|operation:private/u)
      expect(previewText).toContain("admin_diagnostic_export")
      expect(previewText).toContain("live_acceptance_signing_request")
      expect(previewText).toContain("raw_by_design")
      expect(previewText).not.toMatch(/admin-export-private-operation|linked\.json|\/tmp|\/Users|operation:private|yeonjang-goal-validation/u)
      expect(existsSync(oldAdmin)).toBe(true)
      expect(existsSync(oldSigning)).toBe(true)

      const rejectedResponse = await app.inject({
        method: "POST",
        url: "/api/admin/artifact-cleanup",
        payload: { maxAgeMs: 1000, confirmation: "wrong" },
      })
      expect(rejectedResponse.statusCode).toBe(409)
      expect(existsSync(oldAdmin)).toBe(true)
      expect(existsSync(oldSigning)).toBe(true)

      const cleanupResponse = await app.inject({
        method: "POST",
        url: "/api/admin/artifact-cleanup",
        payload: { maxAgeMs: 1000, confirmation: ARTIFACT_CLEANUP_CONFIRMATION },
      })
      expect(cleanupResponse.statusCode).toBe(200)
      const cleanupText = cleanupResponse.body
      expect(cleanupText).not.toMatch(/admin-export-private-operation|linked\.json|\/tmp|\/Users|operation:private|yeonjang-goal-validation/u)
      expect(JSON.stringify(cleanupResponse.json().display)).not.toMatch(/unsafe_symlink|package_path_invalid|manifest_marker_missing|operation:private/u)
      expect(existsSync(oldAdmin)).toBe(false)
      expect(existsSync(oldSigning)).toBe(false)
      expect(existsSync(freshAdmin)).toBe(true)
      expect(existsSync(skippedTarget)).toBe(true)
      expect(lstatSync(skippedLink).isSymbolicLink()).toBe(true)
      const execution = cleanupResponse.json().execution
      expect(execution.targets).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "admin_diagnostic_export", deletedFiles: 1, verifiedDeletedFiles: 1, failedDeleteFiles: 0 }),
        expect.objectContaining({
          kind: "live_acceptance_signing_request",
          deletedFiles: 1,
          verifiedDeletedFiles: 1,
          failedDeleteFiles: 0,
          reasonCounts: expect.objectContaining({ unsafe_symlink: 1 }),
        }),
      ]))
    } finally {
      await app.close()
    }
  })

  it("requires an explicit release package output and keeps audit raw cleanup separate", async () => {
    const stateDir = runtimeFixture.paths.stateDir
    const releaseOutput = join(stateDir, "release-output-private")
    const payloadDir = join(releaseOutput, "payload")
    mkdirSync(payloadDir, { recursive: true })
    const manifest = join(releaseOutput, "manifest.json")
    const checksums = join(releaseOutput, "SHA256SUMS")
    const payloadFile = join(payloadDir, "payload-private.txt")
    writeFileSync(manifest, JSON.stringify({ privatePath: "/Users/private/release" }), "utf8")
    writeFileSync(checksums, "private-checksum  payload/private.txt\n", "utf8")
    writeFileSync(payloadFile, "private payload\n", "utf8")
    touchOld(manifest)
    touchOld(checksums)
    touchOld(payloadFile)
    insertAuditLog({
      timestamp: Date.now(),
      session_id: null,
      source: "test",
      tool_name: "task091.audit.raw",
      params: JSON.stringify({ operationId: "operation:task091-audit-raw" }),
      output: "yeonjang-goal-validation:task091 audit raw should stay",
      result: "failed",
      duration_ms: null,
      approval_required: 0,
      approved_by: null,
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, {
      uiModeRuntime: {
        adminActivation: {
          env: { KNOWBEE_ADMIN_UI: "1" },
          nodeEnv: undefined,
        },
      },
    })
    await app.ready()
    try {
      const defaultPreview = await app.inject({
        method: "GET",
        url: "/api/admin/artifact-cleanup/preview?maxAgeMs=1000",
      })
      expect(defaultPreview.statusCode).toBe(200)
      expect(defaultPreview.body).not.toContain("release_package_output")
      expect(defaultPreview.body).not.toContain("audit_raw")

      const explicitPreview = await app.inject({
        method: "GET",
        url: `/api/admin/artifact-cleanup/preview?maxAgeMs=1000&releaseOutputDir=${encodeURIComponent(releaseOutput)}`,
      })
      expect(explicitPreview.statusCode).toBe(200)
      expect(explicitPreview.body).toContain("release_package_output")
      expect(explicitPreview.body).toContain("explicit-release-output")
      expect(explicitPreview.body).not.toMatch(/release-output-private|payload-private|\/Users\/private|operation:task091-audit-raw|yeonjang-goal-validation/u)
      expect(JSON.stringify(explicitPreview.json().display)).not.toMatch(/release-output-private|package_path_invalid|manifest_marker_missing|operation:task091-audit-raw/u)

      const cleanupResponse = await app.inject({
        method: "POST",
        url: "/api/admin/artifact-cleanup",
        payload: {
          maxAgeMs: 1000,
          confirmation: ARTIFACT_CLEANUP_CONFIRMATION,
          releaseOutputDir: releaseOutput,
        },
      })
      expect(cleanupResponse.statusCode).toBe(200)
      expect(cleanupResponse.body).toContain("release_package_output")
      expect(cleanupResponse.body).not.toMatch(/release-output-private|payload-private|\/Users\/private|operation:task091-audit-raw|yeonjang-goal-validation/u)
      expect(JSON.stringify(cleanupResponse.json().display)).toContain("릴리스 출력")
      expect(JSON.stringify(cleanupResponse.json().display)).not.toMatch(/release-output-private|package_path_invalid|operation:task091-audit-raw/u)
      expect(existsSync(manifest)).toBe(false)
      expect(existsSync(checksums)).toBe(false)
      expect(existsSync(payloadFile)).toBe(true)
      const auditRows = getDb()
        .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE tool_name = ?")
        .get("task091.audit.raw") as { count: number }
      expect(auditRows.count).toBe(1)
    } finally {
      await app.close()
    }
  })

  it("cleans only manifest-whitelisted release payload entries", async () => {
    const stateDir = runtimeFixture.paths.stateDir
    const releaseOutput = join(stateDir, "release-output-whitelist")
    const payloadDir = join(releaseOutput, "payload")
    const whitelistedDir = join(payloadDir, "gateway", "packages", "cli", "dist")
    const rogueDir = join(payloadDir, "rogue")
    mkdirSync(whitelistedDir, { recursive: true })
    mkdirSync(rogueDir, { recursive: true })
    const manifest = join(releaseOutput, "manifest.json")
    const checksums = join(releaseOutput, "SHA256SUMS")
    const whitelistedFile = join(whitelistedDir, "index.js")
    const rogueFile = join(rogueDir, "raw-private.txt")
    const symlinkPath = join(whitelistedDir, "linked.js")
    writeFileSync(manifest, JSON.stringify({
      artifacts: [
        {
          id: "gateway:cli",
          status: "present",
          packagePath: "gateway/packages/cli/dist/index.js",
        },
        {
          id: "invalid:absolute",
          status: "present",
          packagePath: "/private/raw.txt",
        },
        {
          id: "invalid:traversal",
          status: "present",
          packagePath: "../raw.txt",
        },
      ],
    }), "utf8")
    writeFileSync(checksums, "private-checksum  gateway/packages/cli/dist/index.js\n", "utf8")
    writeFileSync(whitelistedFile, "private whitelisted payload\n", "utf8")
    writeFileSync(rogueFile, "private rogue payload\n", "utf8")
    symlinkSync(rogueFile, symlinkPath)
    touchOld(manifest)
    touchOld(checksums)
    touchOld(whitelistedFile)
    touchOld(rogueFile)

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, {
      uiModeRuntime: {
        adminActivation: {
          env: { KNOWBEE_ADMIN_UI: "1" },
          nodeEnv: undefined,
        },
      },
    })
    await app.ready()
    try {
      const cleanupResponse = await app.inject({
        method: "POST",
        url: "/api/admin/artifact-cleanup",
        payload: {
          maxAgeMs: 1000,
          confirmation: ARTIFACT_CLEANUP_CONFIRMATION,
          releaseOutputDir: releaseOutput,
        },
      })
      expect(cleanupResponse.statusCode).toBe(200)
      const body = cleanupResponse.body
      expect(body).toContain("release_package_output")
      expect(body).not.toMatch(/release-output-whitelist|index\.js|raw-private|private whitelisted payload|private rogue payload/u)
      expect(JSON.stringify(cleanupResponse.json().display)).not.toMatch(/package_path_invalid|skipped_directory|release-output-whitelist|index\.js|raw-private/u)
      expect(existsSync(manifest)).toBe(false)
      expect(existsSync(checksums)).toBe(false)
      expect(existsSync(whitelistedFile)).toBe(false)
      expect(existsSync(rogueFile)).toBe(true)
      expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true)
      const releaseTarget = cleanupResponse.json().execution.targets.find(
        (target: { kind: string }) => target.kind === "release_package_output",
      )
      expect(releaseTarget).toEqual(expect.objectContaining({
        deleteEligibleFiles: 3,
        deletedFiles: 3,
        verifiedDeletedFiles: 3,
        failedDeleteFiles: 0,
        reasonCounts: expect.objectContaining({
          package_path_invalid: 2,
          skipped_directory: expect.any(Number),
        }),
      }))
    } finally {
      await app.close()
    }
  })
})
