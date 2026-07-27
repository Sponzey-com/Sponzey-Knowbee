import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { RuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.ts"
import type { LiveAcceptanceEvidence } from "../packages/core/src/release/live-acceptance-admission.ts"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import { produceVerifiedYeonjangAcceptanceEvidence } from "../packages/core/src/release/yeonjang-verified-acceptance-evidence.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
  type YeonjangEvidenceEnvelope,
} from "../packages/core/src/yeonjang/evidence.ts"
import { redactLiveAcceptanceCommandOutput } from "../packages/cli/src/commands/live-acceptance.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const NOW = Date.parse("2026-07-22T02:00:00.000Z")
const tempDirs: string[] = []
let runtimePaths: RuntimePaths

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = join(rootDir, ...relativePath.split("/"))
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, "utf-8")
}

function createReleaseFixture(): string {
  const rootDir = makeTempDir("knowbee-task179-release-root-")
  writeFile(rootDir, "package.json", JSON.stringify({ version: "9.9.9" }))
  writeFile(rootDir, "packages/cli/dist/index.js", "#!/usr/bin/env node\nconsole.log('cli')\n")
  writeFile(rootDir, "packages/core/dist/index.js", "export const core = true\n")
  writeFile(rootDir, "packages/webui/dist/index.html", "<html></html>\n")
  writeFile(rootDir, "packages/core/src/db/migrations.ts", "export const MIGRATIONS = []\n")
  writeFile(rootDir, "Yeonjang/src/protocol.rs", "pub struct Request;\n")
  writeFile(rootDir, "Yeonjang/manifests/permissions.json", "{}\n")
  writeFile(rootDir, "scripts/build-yeonjang-macos.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-macos.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/build-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-linux-headless.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/stop-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/stop-yeonjang-linux-headless.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/build-yeonjang-windows.bat", "@echo off\n")
  writeFile(rootDir, "scripts/start-yeonjang-windows.bat", "@echo off\n")
  writeFile(rootDir, "scripts/stop-yeonjang-windows.bat", "@echo off\n")
  writeFile(rootDir, "docs/release-runbook.md", "# Release Runbook\n")
  ensurePromptSourceFiles(rootDir)
  return rootDir
}

function focusEvidence(
  postCheck: YeonjangEvidenceEnvelope["postCheck"],
  overrides: Partial<Pick<YeonjangEvidenceEnvelope, "targetRef" | "summary">> = {},
): YeonjangEvidenceEnvelope {
  return buildYeonjangEvidenceEnvelope({
    targetRef: overrides.targetRef ?? "yeonjang:office-mac:browser",
    toolName: "yeonjang_browser_focus",
    methodIds: ["browser.focus"],
    group: "browser",
    riskLevel: "moderate",
    requiresApproval: true,
    collectedAt: NOW - 1_000,
    summary: overrides.summary ?? "browser focus post-check state is sanitized",
    postCheck,
  })
}

beforeEach(() => {
  closeDb()
  const runtimeFixture = createTestRuntimeConfigFixture({
    rootDir: makeTempDir("knowbee-task179-state-"),
  })
  runtimePaths = runtimeFixture.paths
  getDb({ paths: runtimeFixture.paths })
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("Task 179 Yeonjang browser.focus release verified evidence", () => {
  it("accepts verified browser.focus release evidence only when post-check is verified or goal_validated", () => {
    const verified = focusEvidence({
      kind: "verified",
      verified: true,
      reason: "focused_target_matched",
    })
    const goalValidated = focusEvidence(
      buildYeonjangGoalValidatedPostCheck({
        diagnosisReceiptId: "diagnosis:task179",
        evidenceRefs: ["operation-evidence:task179"],
      }),
    )
    const unverifiable = focusEvidence({
      kind: "unverifiable",
      verified: false,
      reason: "target_observation_required",
    })

    const result = produceVerifiedYeonjangAcceptanceEvidence([
      { evidence: verified, auditEventId: "audit:verified:179" },
      { evidence: goalValidated, auditEventId: "audit:goal:179" },
      { evidence: unverifiable, auditEventId: "audit:manual:179" },
    ])

    expect(result.accepted).toEqual([
      expect.objectContaining({
        capability: "yeonjang",
        scenarioId: "yeonjang:verified:yeonjang_browser_focus",
        terminalStatus: "passed",
        auditEventId: "audit:verified:179",
      }),
      expect.objectContaining({
        capability: "yeonjang",
        scenarioId: "yeonjang:verified:yeonjang_browser_focus",
        terminalStatus: "passed",
        auditEventId: "audit:goal:179",
      }),
    ])
    expect(result.rejected).toEqual([
      {
        toolName: "yeonjang_browser_focus",
        reasonCode: "verified_yeonjang_post_check_not_verified",
      },
    ])
    expect(JSON.stringify(result)).not.toMatch(/target_observation_required|rawTitle|rawUrl/u)
  })

  it("wires verified focus evidence into release admission while filtering generic verified Yeonjang evidence", () => {
    const genericBypass = {
      evidenceRef: "yeonjang-verified:bypass",
      capability: "yeonjang",
      scenarioId: "yeonjang:verified:yeonjang_browser_focus",
      terminalStatus: "passed",
      auditEventId: "audit:bypass:179",
      executedAt: NOW - 1_000,
      redactionStatus: "verified",
    } satisfies LiveAcceptanceEvidence

    const blocked = buildReleaseManifest({
      rootDir: createReleaseFixture(),
      releaseVersion: "v0.0.0-task179",
      gitTag: "v0.0.0-task179",
      gitCommit: "task179",
      targetPlatforms: ["macos"],
      now: new Date(NOW),
      runtimePaths,
      requiredLiveCapabilities: ["yeonjang"],
      liveAcceptanceEvidence: [genericBypass],
    })

    expect(blocked.yeonjangVerifiedAcceptanceProduction).toEqual({
      acceptedCount: 0,
      rejected: [],
    })
    expect(blocked.liveAcceptance).toMatchObject({
      status: "blocked",
      reasonCodes: ["live_evidence_missing"],
      acceptedEvidenceRefs: [],
    })

    const admitted = buildReleaseManifest({
      rootDir: createReleaseFixture(),
      releaseVersion: "v0.0.0-task179",
      gitTag: "v0.0.0-task179",
      gitCommit: "task179",
      targetPlatforms: ["macos"],
      now: new Date(NOW),
      runtimePaths,
      requiredLiveCapabilities: ["yeonjang"],
      yeonjangVerifiedAcceptanceEvidence: [
        {
          evidence: focusEvidence({
            kind: "verified",
            verified: true,
            reason: "focused_target_matched",
          }),
          auditEventId: "audit:verified:179",
        },
      ],
    })

    expect(admitted.yeonjangLiveAcceptanceProduction).toEqual({ acceptedCount: 0, rejected: [] })
    expect(admitted.yeonjangVerifiedAcceptanceProduction).toMatchObject({
      acceptedCount: 1,
      rejected: [],
    })
    expect(admitted.liveAcceptance.status).toBe("admitted")
    expect(admitted.liveAcceptance.acceptedEvidenceRefs[0]).toMatch(/^yeonjang-verified:[a-f0-9]{64}$/u)
  })

  it("keeps verified focus target internals out of release manifest and CLI live acceptance output", () => {
    const sensitiveEvidence = focusEvidence(
      {
        kind: "verified",
        verified: true,
        reason: "focused_target_matched",
      },
      {
        targetRef:
          "yeonjang:office-mac:browser:https://example.test/admin?token=private:pid=4401:window-private:tab-private",
        summary:
          "raw focused title Private Admin Console raw focused URL https://example.test/admin?token=private pid=4401 windowId=window-private tabId=tab-private operationId=operation:task179 receipt payload structured diagnosis payload",
      },
    )

    const manifest = buildReleaseManifest({
      rootDir: createReleaseFixture(),
      releaseVersion: "v0.0.0-task179",
      gitTag: "v0.0.0-task179",
      gitCommit: "task179",
      targetPlatforms: ["macos"],
      now: new Date(NOW),
      runtimePaths,
      requiredLiveCapabilities: ["yeonjang"],
      yeonjangVerifiedAcceptanceEvidence: [
        {
          evidence: sensitiveEvidence,
          auditEventId: "audit:verified:179",
        },
      ],
    })
    const safeOutput = redactLiveAcceptanceCommandOutput({
      status: manifest.liveAcceptance.status,
      evidenceCount: manifest.liveAcceptance.acceptedEvidenceRefs.length,
      liveAcceptance: manifest.liveAcceptance,
      yeonjangVerifiedAcceptanceProduction: manifest.yeonjangVerifiedAcceptanceProduction,
    })
    const serialized = JSON.stringify({ manifest, safeOutput })

    expect(serialized).toContain("yeonjangVerifiedAcceptanceProduction")
    expect(serialized).toContain("yeonjang-verified:")
    expect(serialized).not.toMatch(
      /Private Admin Console|token=private|pid=4401|window-private|tab-private|operationId|receipt payload|structured diagnosis payload/u,
    )
    expect(manifest.yeonjangVerifiedAcceptanceProduction).toEqual({
      acceptedCount: 1,
      rejected: [],
    })
  })
})
