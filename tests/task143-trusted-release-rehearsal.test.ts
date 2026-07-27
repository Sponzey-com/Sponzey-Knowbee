import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function run(arguments_: string[]) {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task143-cli-"))
  tempDirs.push(root)
  const outputDir = join(root, "release-output")
  const result = spawnSync(
    process.execPath,
    [
      "scripts/release-package.mjs",
      "--dry-run",
      "--json",
      "--no-copy",
      "--output-dir",
      outputDir,
      ...arguments_,
    ],
    {
      cwd: resolve("."),
      encoding: "utf8",
      env: { ...process.env, KNOWBEE_STATE_DIR: join(root, "state") },
    },
  )
  return { result, outputDir }
}

describe("task143 trusted release operational rehearsal", () => {
  it("requires both source paths before starting the rehearsal mode", () => {
    const { result, outputDir } = run([
      "--run-operational-rehearsals",
      "--npm-stage-dir",
      "/private/stage",
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr.trim()).toBe("operational_rehearsal_arguments_incomplete")
    expect(existsSync(outputDir)).toBe(false)
  })

  it("rejects external receipt injection as a publication authority", () => {
    const { result, outputDir } = run([
      "--npm-install-receipt",
      "/private/forged-npm.json",
      "--backup-restore-receipt",
      "/private/forged-backup.json",
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr.trim()).toBe("external_operational_receipt_forbidden")
    expect(result.stderr).not.toContain("/private/")
    expect(existsSync(outputDir)).toBe(false)
  })

  it("does not inspect a stage or snapshot unless the explicit mode is enabled", () => {
    const { result, outputDir } = run([
      "--npm-stage-dir",
      "/private/stage",
      "--backup-snapshot-manifest",
      "/private/snapshot.json",
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr.trim()).toBe("operational_rehearsal_mode_required")
    expect(result.stderr).not.toContain("/private/")
    expect(existsSync(outputDir)).toBe(false)
  })
})
