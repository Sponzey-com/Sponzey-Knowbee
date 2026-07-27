import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  createArtifactStorageContext,
  recordArtifactMetadata,
} from "../packages/core/src/artifacts/lifecycle.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { registerArtifactsRoute } from "../packages/core/src/api/routes/artifacts.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string }): Promise<{ statusCode: number; body: string }>
}

const tempDirs: string[] = []

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task019 artifact route classification", () => {
  it("serves user artifacts but rejects internal artifacts and download-query bypasses", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task019-artifact-route-"))
    tempDirs.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    initializeTestDbRuntime(runtime.paths.stateDir)
    const storage = createArtifactStorageContext(runtime.paths)
    const userPath = join(storage.rootDir, "exports", "user.txt")
    const internalPath = join(storage.rootDir, "exports", "internal.txt")
    mkdirSync(dirname(userPath), { recursive: true })
    writeFileSync(userPath, "public result")
    writeFileSync(internalPath, "private diagnosis")
    recordArtifactMetadata({
      ownerChannel: "webui",
      artifactPath: userPath,
      dataClassification: "user",
    }, storage)
    recordArtifactMetadata({
      ownerChannel: "audit",
      artifactPath: internalPath,
      dataClassification: "internal",
    }, storage)

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtime.config, runtime.paths)
    registerArtifactsRoute(app as never)
    await app.ready()
    try {
      expect((await app.inject({ method: "GET", url: "/api/artifacts/exports/user.txt" })).statusCode).toBe(200)
      const internal = await app.inject({
        method: "GET",
        url: "/api/artifacts/exports/internal.txt?download=1",
      })
      expect(internal.statusCode).toBe(403)
      expect(internal.body).not.toContain("private diagnosis")
    } finally {
      await app.close()
    }
  })
})
