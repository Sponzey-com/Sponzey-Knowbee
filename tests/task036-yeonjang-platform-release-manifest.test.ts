import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"

const directories: string[] = []

afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("Task 036 Yeonjang platform release manifest", () => {
  it("publishes deterministic and live platform readiness as separate release evidence", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task036-platform-release-"))
    directories.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    const manifest = buildReleaseManifest({
      rootDir,
      runtimePaths: runtime.paths,
      targetPlatforms: ["macos"],
      availableYeonjangPlatforms: ["macos"],
      yeonjangPlatformDeterministicReceipts: [
        { platform: "macos", status: "passed", reasonCodes: [] },
      ],
      yeonjangPlatformLiveRecords: [],
      now: new Date("2026-07-20T00:00:00.000Z"),
    })

    expect(manifest.yeonjangPlatformAcceptance).toMatchObject({
      deterministicReady: true,
      availableLiveReady: false,
      publicReleaseReady: false,
      platforms: [
        { platform: "linux", required: false, live: "unavailable" },
        { platform: "macos", required: true, deterministic: "passed", live: "not_run" },
        { platform: "windows", required: false, live: "unavailable" },
      ],
    })
  })
})
