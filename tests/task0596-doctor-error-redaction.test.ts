import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): string {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0596-doctor-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return runtimeFixture.paths.stateDir
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0596 doctor diagnostic error redaction", () => {
  it("redacts artifact storage paths before returning Doctor check details", () => {
    const stateDir = useTempState()
    const report = runDoctor({ config: runtimeFixture.config, paths: runtimeFixture.paths,
      mode: "quick",
      includeEnvironment: false,
      includeReleasePackage: false,
      now: new Date("2026-07-06T00:00:00.000Z"),
    })
    const artifactStorage = report.checks.find((check) => check.name === "artifact.storage")

    expect(artifactStorage).toBeTruthy()
    expect(JSON.stringify(artifactStorage?.detail)).not.toContain(stateDir)
    expect(JSON.stringify(artifactStorage?.detail)).not.toContain(runtimeFixture.paths.stateDir)
    expect(artifactStorage?.detail).toMatchObject({ artifactsDir: expect.any(String) })
  })

  it("keeps Doctor unknown-state exception details behind the redaction helper", () => {
    const source = readFileSync("packages/core/src/diagnostics/doctor.ts", "utf-8")

    expect(source).toContain("function doctorErrorMessage(error: unknown): string")
    expect(source).toContain("return redactLogText(raw)")
    expect(source).not.toMatch(/\{\s*error:\s*error instanceof Error \? error\.message : String\(error\)\s*\}/u)
  })
})
