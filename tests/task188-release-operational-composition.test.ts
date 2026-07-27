import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { formatReleaseDryRunSummary } from "../scripts/run-release-dry-run-rehearsal.mjs"
import { buildNpmCleanInstallEnvironment } from "../scripts/smoke-npm-install.mjs"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function runWrapper(arguments_: string[]) {
  const tempRoot = makeTempDir("knowbee-task188-tmp-")
  const externalState = join(makeTempDir("knowbee-task188-external-"), "must-not-exist")
  const outputDir = join(makeTempDir("knowbee-task188-output-"), "dry-run")
  const command = spawnSync(
    process.execPath,
    [
      "scripts/run-release-dry-run-rehearsal.mjs",
      "--json",
      "--no-copy",
      "--output-dir",
      outputDir,
      ...arguments_,
    ],
    {
      cwd: resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        KNOWBEE_STATE_DIR: externalState,
        TMPDIR: tempRoot,
        TMP: tempRoot,
        TEMP: tempRoot,
      },
    },
  )
  return { command, externalState, outputDir, tempRoot }
}

describe("task188 trusted release operational composition", () => {
  it("projects a bounded product summary without internal paths", () => {
    const summary = formatReleaseDryRunSummary({
      readiness: { status: "blocked", blockerCodes: ["performance_gate_failed"] },
      outputDir: "/private/release-output",
      manifestPath: "/private/release-output/manifest.json",
      manifest: {
        releaseVersion: "v0.1.0",
        rootDir: "/private/repository",
        artifacts: [{ status: "present", sourcePath: "/private/repository/dist/index.js" }],
        requiredMissing: [],
        operationalRehearsalEvidence: {
          status: "passed",
          artifactCleanupSmoke: {
            status: "verified",
            checked: ["preview", "confirmation_failure"],
            destructiveFixtureVerified: false,
          },
        },
      },
    })

    expect(summary).toBe(
      [
        "Release dry-run: v0.1.0",
        "  readiness: blocked (1 blockers)",
        "  operational rehearsals: passed",
        "  artifact cleanup smoke: verified (2 checks)",
        "  artifacts: 1 present, 0 required missing",
        "",
      ].join("\n"),
    )
    expect(summary).not.toContain("/private/")
  })

  it("removes hidden test module paths and isolates the npm cache", () => {
    const environment = buildNpmCleanInstallEnvironment({
      processEnv: {
        NODE_PATH: "/private/stale-workspace/node_modules",
        NODE_OPTIONS: "--require /private/test-loader.js",
        NODE_ENV: "test",
        TEST: "true",
        VITEST: "true",
      },
      cacheDir: "/private/isolated-cache",
    })

    expect(environment).toMatchObject({
      NODE_ENV: "production",
      KNOWBEE_LOG_LEVEL: "product",
      npm_config_cache: "/private/isolated-cache",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_ignore_scripts: "true",
    })
    expect(environment).not.toHaveProperty("NODE_PATH")
    expect(environment).not.toHaveProperty("NODE_OPTIONS")
    expect(environment).not.toHaveProperty("TEST")
    expect(environment).not.toHaveProperty("VITEST")
  })

  it("uses the trusted operational rehearsal wrapper for the standard dry-run command", () => {
    const packageManifest = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }

    expect(packageManifest.scripts?.["release:dry-run"]).toBe(
      "node scripts/run-release-dry-run-rehearsal.mjs",
    )
  })

  it("removes only current-run npm and backup blockers and cleans isolated fixtures", () => {
    const { command, externalState, outputDir, tempRoot } = runWrapper([])

    expect(command.status, command.stderr).toBe(0)
    const result = JSON.parse(command.stdout)
    expect(result.manifest.operationalRehearsalEvidence).toMatchObject({
      status: "passed",
      npmInstall: { status: "verified", packageVersion: "0.1.0" },
      backupRestore: { status: "verified", schemaVersion: expect.any(Number) },
      artifactCleanupSmoke: {
        status: "verified",
        checked: ["preview", "confirmation_failure"],
      },
    })
    expect(result.readiness.blockerCodes).not.toContain("npm_install_rehearsal_failed")
    expect(result.readiness.blockerCodes).not.toContain("backup_restore_rehearsal_failed")
    expect(result.readiness.blockerCodes).not.toContain("artifact_cleanup_smoke_failed")
    expect(result.readiness.blockerCodes).toEqual(
      expect.arrayContaining([
        "performance_gate_failed",
        "sub_agent_gate_failed",
        "live_acceptance_failed",
      ]),
    )
    expect(existsSync(externalState)).toBe(false)
    expect(existsSync(outputDir)).toBe(false)
    expect(
      readdirSync(tempRoot).filter((entry) => entry.startsWith("knowbee-release-rehearsal-")),
    ).toEqual([])
    expect(command.stdout).not.toContain(externalState)
  }, 120_000)

  it("rejects caller-supplied operational evidence paths without echoing them", () => {
    const { command, externalState, outputDir, tempRoot } = runWrapper([
      "--npm-stage-dir",
      "/private/forged-stage",
    ])

    expect(command.status).not.toBe(0)
    expect(command.stderr.trim()).toBe("operational_rehearsal_options_reserved")
    expect(command.stderr).not.toContain("/private/")
    expect(existsSync(externalState)).toBe(false)
    expect(existsSync(outputDir)).toBe(false)
    expect(
      readdirSync(tempRoot).filter((entry) => entry.startsWith("knowbee-release-rehearsal-")),
    ).toEqual([])
  })
})
