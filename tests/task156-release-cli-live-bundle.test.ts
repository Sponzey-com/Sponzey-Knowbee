import { spawnSync } from "node:child_process"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  type LiveAcceptanceBundlePayload,
  buildLiveAcceptanceBundleChecksum,
  buildLiveAcceptanceBundleSigningBytes,
} from "../packages/core/src/release/live-acceptance-bundle.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function runRelease(args: string[], stateDir: string) {
  return spawnSync(process.execPath, [resolve("scripts/release-package.mjs"), ...args], {
    cwd: resolve("."),
    encoding: "utf8",
    env: { ...process.env, KNOWBEE_STATE_DIR: stateDir },
  })
}

describe("Task 156 release CLI live bundle", () => {
  it("loads one explicit regular bundle and rejects invalid or symlink inputs", () => {
    const directory = mkdtempSync(join(tmpdir(), "knowbee-task156-cli-"))
    tempDirs.push(directory)
    const stateDir = join(directory, "state")
    const baseline = runRelease(["--dry-run", "--json", "--no-copy"], stateDir)
    expect(baseline.status, baseline.stderr).toBe(0)
    const baselineJson = JSON.parse(baseline.stdout) as {
      manifest: { appVersion: string; gitTag: string | null; gitCommit: string | null }
    }
    const now = Date.now()
    const { publicKey, privateKey } = generateKeyPairSync("ed25519")
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" })
    const publicKeyPath = join(directory, "live-acceptance-public.pem")
    writeFileSync(publicKeyPath, publicKeyPem, "utf8")
    const keyId = `sha256:${createHash("sha256")
      .update(publicKey.export({ type: "spki", format: "der" }))
      .digest("hex")}` as const
    const payload: LiveAcceptanceBundlePayload = {
      kind: "knowbee.release.live_acceptance_bundle",
      schemaVersion: 2,
      candidate: {
        appVersion: baselineJson.manifest.appVersion,
        gitTag: baselineJson.manifest.gitTag,
        gitCommit: baselineJson.manifest.gitCommit,
      },
      approval: {
        decision: "approved",
        authorizationStatus: "active",
        authorizationId: "authorization:live:cli-156",
        auditEventId: "audit:live:cli-156",
        principalType: "authenticated_user",
        principalId: "operator:cli-156",
        authenticationId: "authentication:cli-156",
        roles: ["release_administrator"],
        approvedAt: now - 1_000,
        expiresAt: now + 60_000,
        redactionStatus: "verified",
      },
      evidence: ["webui", "telegram", "slack", "web", "skill", "mcp", "yeonjang"].map(
        (capability, index) => ({
          evidenceRef: `live:${capability}:cli-156`,
          capability: capability as LiveAcceptanceBundlePayload["evidence"][number]["capability"],
          scenarioId: `${capability}-live`,
          terminalStatus: "passed",
          auditEventId: `audit:${capability}:cli-156`,
          executedAt: now - index,
          redactionStatus: "verified",
        }),
      ),
    }
    const signature = sign(null, buildLiveAcceptanceBundleSigningBytes(payload), privateKey)
    const bundle = {
      ...payload,
      payloadSha256: buildLiveAcceptanceBundleChecksum(payload),
      signature: {
        algorithm: "ed25519",
        keyId,
        valueBase64: signature.toString("base64"),
      },
    }
    const bundlePath = join(directory, "live-acceptance.json")
    writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8")

    const accepted = runRelease(
      [
        "--dry-run",
        "--json",
        "--no-copy",
        "--live-acceptance-bundle",
        bundlePath,
        "--live-acceptance-public-key",
        publicKeyPath,
      ],
      stateDir,
    )
    expect(accepted.status, accepted.stderr).toBe(0)
    const acceptedJson = JSON.parse(accepted.stdout) as {
      manifest: { liveAcceptance: { status: string; acceptedEvidenceRefs: string[] } }
    }
    expect(acceptedJson.manifest.liveAcceptance).toMatchObject({
      status: "admitted",
      acceptedEvidenceRefs: expect.arrayContaining(["live:webui:cli-156", "live:yeonjang:cli-156"]),
    })
    expect(accepted.stdout).not.toMatch(
      /authorization:live|audit:live:cli|payloadSha256|valueBase64|BEGIN PUBLIC KEY/u,
    )

    const invalidPath = join(directory, "invalid.json")
    writeFileSync(invalidPath, '{"kind":"invalid"}\n', "utf8")
    const invalid = runRelease(
      [
        "--dry-run",
        "--live-acceptance-bundle",
        invalidPath,
        "--live-acceptance-public-key",
        publicKeyPath,
      ],
      stateDir,
    )
    expect(invalid.status).not.toBe(0)
    expect(invalid.stderr).toContain("live_acceptance_bundle_shape_invalid")

    const symlinkPath = join(directory, "live-acceptance-link.json")
    symlinkSync(bundlePath, symlinkPath)
    const symlink = runRelease(
      [
        "--dry-run",
        "--live-acceptance-bundle",
        symlinkPath,
        "--live-acceptance-public-key",
        publicKeyPath,
      ],
      stateDir,
    )
    expect(symlink.status).not.toBe(0)
    expect(symlink.stderr).toContain("live_acceptance_bundle_path_unsafe")

    const missingKey = runRelease(["--dry-run", "--live-acceptance-bundle", bundlePath], stateDir)
    expect(missingKey.status).not.toBe(0)
    expect(missingKey.stderr).toContain("live_acceptance_signature_arguments_incomplete")

    const missingBundle = runRelease(
      ["--dry-run", "--live-acceptance-public-key", publicKeyPath],
      stateDir,
    )
    expect(missingBundle.status).not.toBe(0)
    expect(missingBundle.stderr).toContain("live_acceptance_signature_arguments_incomplete")

    const publicKeyLinkPath = join(directory, "live-acceptance-public-link.pem")
    symlinkSync(publicKeyPath, publicKeyLinkPath)
    const publicKeyLink = runRelease(
      [
        "--dry-run",
        "--live-acceptance-bundle",
        bundlePath,
        "--live-acceptance-public-key",
        publicKeyLinkPath,
      ],
      stateDir,
    )
    expect(publicKeyLink.status).not.toBe(0)
    expect(publicKeyLink.stderr).toContain("live_acceptance_public_key_path_unsafe")

    const privateKeyPath = join(directory, "forbidden-private.pem")
    writeFileSync(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8")
    const privateKeyInput = runRelease(
      [
        "--dry-run",
        "--live-acceptance-bundle",
        bundlePath,
        "--live-acceptance-public-key",
        privateKeyPath,
      ],
      stateDir,
    )
    expect(privateKeyInput.status).not.toBe(0)
    expect(privateKeyInput.stderr).toContain("live_acceptance_private_key_forbidden")

    const alteredPayload: LiveAcceptanceBundlePayload = {
      ...payload,
      evidence: payload.evidence.map((item, index) =>
        index === 0 ? { ...item, evidenceRef: "live:webui:altered" } : item,
      ),
    }
    const alteredBundlePath = join(directory, "live-acceptance-altered.json")
    writeFileSync(
      alteredBundlePath,
      `${JSON.stringify(
        {
          ...alteredPayload,
          payloadSha256: buildLiveAcceptanceBundleChecksum(alteredPayload),
          signature: bundle.signature,
        },
        null,
        2,
      )}\n`,
      "utf8",
    )
    const altered = runRelease(
      [
        "--dry-run",
        "--live-acceptance-bundle",
        alteredBundlePath,
        "--live-acceptance-public-key",
        publicKeyPath,
      ],
      stateDir,
    )
    expect(altered.status).not.toBe(0)
    expect(altered.stderr).toContain("live_acceptance_bundle_signature_invalid")

    const { publicKey: untrustedPublicKey } = generateKeyPairSync("ed25519")
    const untrustedPublicKeyPath = join(directory, "untrusted-public.pem")
    writeFileSync(
      untrustedPublicKeyPath,
      untrustedPublicKey.export({ type: "spki", format: "pem" }),
      "utf8",
    )
    const untrustedKey = runRelease(
      [
        "--dry-run",
        "--live-acceptance-bundle",
        bundlePath,
        "--live-acceptance-public-key",
        untrustedPublicKeyPath,
      ],
      stateDir,
    )
    expect(untrustedKey.status).not.toBe(0)
    expect(untrustedKey.stderr).toContain("live_acceptance_bundle_signature_invalid")
  })

  it("does not add an environment fallback or directory discovery", () => {
    const source = readFileSync("scripts/release-package.mjs", "utf8")
    expect(source).not.toMatch(
      /KNOWBEE_LIVE_ACCEPTANCE_BUNDLE|KNOWBEE_LIVE_ACCEPTANCE_PUBLIC_KEY|readdirSync|glob/u,
    )
  })
})
