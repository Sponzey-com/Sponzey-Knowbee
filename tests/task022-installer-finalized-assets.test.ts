import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  collectInstallerFinalizedAssets,
  verifyInstallerFinalizedAssets,
} from "../scripts/lib/installer-finalized-assets.mjs"

const directories: string[] = []
const targets = ["darwin-arm64", "darwin-x64", "linux-x64", "win32-arm64", "win32-x64"]
const manifestBytes = `${JSON.stringify({
  kind: "knowbee.install.manifest",
  schemaVersion: 2,
  releaseVersion: "9.8.7",
})}\n`
const candidateId = `sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-final-assets-"))
  directories.push(root)
  const assetRoot = join(root, "assets")
  mkdirSync(assetRoot)
  const artifacts = targets.map((target) => ({
    target,
    name: `knowbee-9.8.7-${target}.${target.startsWith("win32-") ? "zip" : "tar.gz"}`,
  }))
  const verifiers = targets.map((target) => ({
    target,
    name: `knowbee-installer-verify-${target}${target.startsWith("win32-") ? ".exe" : ""}`,
  }))
  for (const name of [
    "install.sh",
    "install.ps1",
    "installer-manifest.json",
    "installer-release-gate.json",
    ...artifacts.map((value) => value.name),
    ...verifiers.map((value) => value.name),
  ]) {
    writeFileSync(
      join(assetRoot, name),
      name === "installer-manifest.json" ? manifestBytes : `asset:${name}\n`,
    )
  }
  return { root, assetRoot, artifacts, verifiers }
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task022 finalized installer assets", () => {
  it("hashes exactly fourteen unsigned installer assets and verifies unchanged bytes", async () => {
    const input = fixture()
    const collected = await collectInstallerFinalizedAssets({
      candidateId,
      releaseTag: "v9.8.7",
      assetRoot: input.assetRoot,
      artifacts: input.artifacts,
      verifiers: input.verifiers,
    })
    expect(collected).toMatchObject({ status: "ready", inventory: { assetCount: 14 } })
    if (collected.status !== "ready") return
    expect(
      await verifyInstallerFinalizedAssets({
        inventory: collected.inventory,
        assetRoot: input.assetRoot,
      }),
    ).toEqual({ status: "verified", candidateId, releaseTag: "v9.8.7", assetCount: 14 })

    writeFileSync(join(input.assetRoot, "install.sh"), "changed\n")
    expect(
      await verifyInstallerFinalizedAssets({
        inventory: collected.inventory,
        assetRoot: input.assetRoot,
      }),
    ).toEqual({ status: "blocked", reasonCode: "installer_finalized_asset_mismatch:install.sh" })
  })

  it("rejects missing, extra and duplicate declared assets", async () => {
    const missing = fixture()
    rmSync(join(missing.assetRoot, "installer-manifest.json"))
    expect(
      await collectInstallerFinalizedAssets({
        candidateId,
        releaseTag: "v9.8.7",
        assetRoot: missing.assetRoot,
        artifacts: missing.artifacts,
        verifiers: missing.verifiers,
      }),
    ).toEqual({ status: "rejected", reasonCode: "installer_finalized_asset_set_invalid" })

    const extra = fixture()
    writeFileSync(join(extra.assetRoot, "unexpected"), "no\n")
    expect(
      await collectInstallerFinalizedAssets({
        candidateId,
        releaseTag: "v9.8.7",
        assetRoot: extra.assetRoot,
        artifacts: extra.artifacts,
        verifiers: extra.verifiers,
      }),
    ).toEqual({ status: "rejected", reasonCode: "installer_finalized_asset_set_invalid" })

    const stale = fixture()
    expect(
      await collectInstallerFinalizedAssets({
        candidateId: `sha256:${"f".repeat(64)}`,
        releaseTag: "v9.8.7",
        assetRoot: stale.assetRoot,
        artifacts: stale.artifacts,
        verifiers: stale.verifiers,
      }),
    ).toEqual({ status: "rejected", reasonCode: "installer_finalized_candidate_mismatch" })
  })

  it("keeps rehearsal bytes immutable while adding only final gate metadata", () => {
    const workflow = readFileSync(".github/workflows/installer-release-finalize.yml", "utf8")
    expect(workflow).toContain("release/published-rehearsal-assets")
    expect(workflow).toContain('gh release download "$RELEASE_TAG"')
    expect(workflow).toContain('cmp --silent "$asset" "release/published-rehearsal-assets/$name"')
    expect(workflow).toContain("installer-finalized-assets.json")
    expect(workflow).toContain("installer-release-gate.json")
    expect(workflow).not.toMatch(/gh release upload[\s\S]*finalized_assets/iu)
    expect(workflow).not.toContain("--clobber")
  })

  it("promotes only a verified exact prerelease and restores the previous latest on failure", () => {
    const workflow = readFileSync(".github/workflows/installer-stable-promote.yml", "utf8")
    expect(workflow).toContain("workflow_dispatch:")
    expect(workflow).not.toMatch(/\n\s+(push|schedule|release):/u)
    expect(workflow).toContain("environment: installer-stable-promotion")
    expect(workflow).toContain("installer-finalized-assets-${{ inputs.release_tag }}")
    expect(workflow).toContain("stable_release_tag_invalid")
    expect(workflow).toContain("collect-installer-finalized-assets.mjs verify")
    expect(workflow).toContain('test "$inventory_tag" = "$RELEASE_TAG"')
    expect(workflow).toContain('test "$gate_candidate" = "$inventory_candidate"')
    expect(workflow).toContain(
      'test "$(gh release view "$RELEASE_TAG" --json isPrerelease --jq .isPrerelease)" = true',
    )
    expect(workflow).toContain('gh release edit "$RELEASE_TAG" --prerelease=false --latest')
    expect(workflow).toContain('gh release edit "$RELEASE_TAG" --prerelease')
    expect(workflow).toContain('gh release edit "$PREVIOUS_LATEST_TAG" --latest')
    expect(workflow).toContain("releases/latest/download/install.sh")
    expect(workflow).toContain("releases/latest/download/install.ps1")
    expect(workflow).not.toMatch(/INSTALLER_SIGNING|DEVELOPER_ID|NOTARY|CODESIGN/iu)
    expect(workflow).not.toMatch(/npm pack|cargo build|build-installer/iu)
  })
})
