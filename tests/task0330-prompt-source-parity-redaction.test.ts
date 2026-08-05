import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerPromptSourcesRoute } from "../packages/core/src/api/routes/prompt-sources.ts"

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

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0330 prompt source parity redaction", () => {
  it("redacts the requested workDir while preserving parity diagnostics", async () => {
    const workDir = makeTempDir("knowbee-task0330-work-")
    const app = Fastify({ logger: false })
    registerPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/parity?workDir=${encodeURIComponent(workDir)}`,
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.workDir).toBe("[internal-path-redacted]")
      expect(typeof body.parity.ok).toBe("boolean")
      expect(Array.isArray(body.parity.issues)).toBe(true)
      expect(JSON.stringify(body)).not.toContain(workDir)
    } finally {
      await app.close()
    }
  })
})
