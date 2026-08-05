import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAuditRoute } from "../packages/core/src/api/routes/audit.js"
import {
  closeDb,
  insertArtifactMetadata,
  insertArtifactReceipt,
} from "../packages/core/src/db/index.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

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
let runtimeFixture: ReturnType<typeof createTestRuntimeConfigFixture>

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function useTempState(): string {
  closeDb()
  const rootDir = makeTempDir("knowbee-task0347-state-")
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return runtimeFixture.paths.stateDir
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

describe("task0347 audit artifact path redaction", () => {
  it("masks local artifact paths in audit lists and run exports", async () => {
    const artifactDir = makeTempDir("knowbee-task0347-artifact-")
    const artifactPath = join(artifactDir, "private-report.txt")
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(artifactPath, "private artifact", "utf-8")

    insertArtifactMetadata({
      artifactPath,
      ownerChannel: "webui",
      sourceRunId: "run:task0347",
      requestGroupId: "group:task0347",
      mimeType: "text/plain",
      metadata: {
        previewPath: artifactPath,
        nested: { path: artifactPath },
      },
    })
    insertArtifactReceipt({
      runId: "run:task0347",
      requestGroupId: "group:task0347",
      channel: "webui",
      artifactPath,
      mimeType: "text/plain",
      deliveryReceipt: {
        filePath: artifactPath,
        status: "sent",
      },
      deliveredAt: Date.now(),
    })

    const app = Fastify({ logger: false })
    registerAuditRoute(app, {
      resolvePrincipal: () => ({
        principalRef: "test:task0347-auditor",
        role: "audit_reader",
        runIds: ["run:task0347"],
        requestGroupIds: [],
      }),
      recordAccess: () => ({ recorded: true }),
    })
    await app.ready()
    try {
      const artifactResponse = await app.inject({
        method: "GET",
        url: "/api/audit?kind=artifact&limit=20&runId=run%3Atask0347&purpose=security_review",
      })
      expect(artifactResponse.statusCode).toBe(200)
      const artifactBody = artifactResponse.json()
      expect(JSON.stringify(artifactBody)).toContain("[internal-path-redacted]")
      expect(JSON.stringify(artifactBody)).not.toContain(artifactPath)
      expect(JSON.stringify(artifactBody)).not.toContain(artifactDir)

      const deliveryResponse = await app.inject({
        method: "GET",
        url: "/api/audit?kind=delivery&limit=20&runId=run%3Atask0347&purpose=security_review",
      })
      expect(deliveryResponse.statusCode).toBe(200)
      const deliveryBody = deliveryResponse.json()
      expect(JSON.stringify(deliveryBody)).toContain("[internal-path-redacted]")
      expect(JSON.stringify(deliveryBody)).not.toContain(artifactPath)
      expect(JSON.stringify(deliveryBody)).not.toContain(artifactDir)

      const exportResponse = await app.inject({
        method: "GET",
        url: "/api/audit/runs/run%3Atask0347/export?format=markdown&limit=20&purpose=security_review",
      })
      expect(exportResponse.statusCode).toBe(200)
      const exportBody = exportResponse.json()
      expect(exportBody.content).toContain("[internal-path-redacted]")
      expect(JSON.stringify(exportBody)).not.toContain(artifactPath)
      expect(JSON.stringify(exportBody)).not.toContain(artifactDir)
      expect(JSON.stringify(exportBody)).not.toContain(runtimeFixture.paths.stateDir)
    } finally {
      await app.close()
    }
  })
})
