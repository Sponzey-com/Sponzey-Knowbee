import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const directories: string[] = []
const NOW = new Date("2026-07-21T09:00:00.000Z")

afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("Task 044 Yeonjang release evidence wiring", () => {
  it("passes capability readiness and OS profile smoke evidence into the release manifest", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task044-release-evidence-"))
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
      yeonjangPlatformRequiredCapabilityMethods: ["clipboard.read", "clipboard.write"],
      yeonjangPlatformCapabilityReceipts: [
        {
          platform: "macos",
          method: "clipboard.read",
          supported: true,
          permissionEnabled: true,
          toolHealthStatus: "ready",
          observedAt: NOW.getTime(),
          evidenceRef: "capability:macos:clipboard-read",
        },
        {
          platform: "macos",
          method: "clipboard.write",
          supported: true,
          permissionEnabled: true,
          toolHealthStatus: "ready",
          observedAt: NOW.getTime(),
          evidenceRef: "capability:macos:clipboard-write",
        },
      ],
      yeonjangProfileSmokeEvidence: [
        {
          id: "macos",
          platform: "macos",
          profile: "desktop_interactive",
          startupMode: "autostart",
          windowMode: "hidden",
          trayState: "visible",
          observedAt: NOW.getTime(),
          evidenceRef: "profile:macos",
        },
      ],
      yeonjangProfileSmokeMaxAgeMs: 5_000,
      yeonjangLiveSessionMaxAgeMs: 5_000,
      now: NOW,
    })

    expect(manifest.yeonjangPlatformAcceptance).toMatchObject({
      capabilityReady: true,
      platforms: expect.arrayContaining([
        expect.objectContaining({
          platform: "macos",
          capabilityReadiness: [
            expect.objectContaining({ method: "clipboard.read", status: "passed" }),
            expect.objectContaining({ method: "clipboard.write", status: "passed" }),
          ],
        }),
      ]),
    })
    expect(manifest.yeonjangMultiInstanceEvidence.profileSmoke).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "macos", status: "passed", evidenceRefs: ["profile:macos"] }),
    ]))
    expect(JSON.stringify(manifest.yeonjangPlatformAcceptance)).not.toMatch(/private|sessionId|instanceId|clientId|commandId/u)
    expect(JSON.stringify(manifest.yeonjangMultiInstanceEvidence.profileSmoke)).not.toMatch(/private|sessionId|instanceId|clientId|commandId/u)
  })
})
