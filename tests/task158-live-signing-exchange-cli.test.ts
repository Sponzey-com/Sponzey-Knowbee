import { spawnSync } from "node:child_process"
import { generateKeyPairSync, sign } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { LiveAcceptanceBundlePayload } from "../packages/core/src/release/live-acceptance-bundle.ts"
import { buildLiveAcceptanceBundleSigningBytes } from "../packages/core/src/release/live-acceptance-bundle.ts"
import type { LiveAcceptanceSigningRequest } from "../packages/core/src/release/live-acceptance-signing-exchange.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function run(script: string, args: string[], stateDir: string) {
  return spawnSync(process.execPath, [resolve(script), ...args], {
    cwd: resolve("."),
    encoding: "utf8",
    env: { ...process.env, KNOWBEE_STATE_DIR: stateDir },
  })
}

describe("Task 158 live signing exchange CLI", () => {
  it("round-trips an external signature into release admission without owning the signer", () => {
    const directory = mkdtempSync(join(tmpdir(), "knowbee-task158-exchange-"))
    tempDirs.push(directory)
    const stateDir = join(directory, "state")
    const baseline = run(
      "scripts/release-package.mjs",
      ["--dry-run", "--json", "--no-copy"],
      stateDir,
    )
    expect(baseline.status, baseline.stderr).toBe(0)
    const baselineJson = JSON.parse(baseline.stdout) as {
      manifest: { appVersion: string; gitTag: string | null; gitCommit: string | null }
    }
    const now = Date.now()
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
        authorizationId: "authorization:live:cli-158",
        auditEventId: "audit:live:cli-158",
        principalType: "authenticated_user",
        principalId: "operator:cli-158",
        authenticationId: "authentication:cli-158",
        roles: ["release_administrator"],
        approvedAt: now - 1_000,
        expiresAt: now + 60_000,
        redactionStatus: "verified",
      },
      evidence: ["webui", "telegram", "slack", "web", "skill", "mcp", "yeonjang"].map(
        (capability, index) => ({
          evidenceRef: `live:${capability}:cli-158`,
          capability: capability as LiveAcceptanceBundlePayload["evidence"][number]["capability"],
          scenarioId: `${capability}-live`,
          terminalStatus: "passed",
          auditEventId: `audit:${capability}:cli-158`,
          executedAt: now - index,
          redactionStatus: "verified",
        }),
      ),
    }
    const payloadPath = join(directory, "payload.json")
    const requestPath = join(directory, "request.json")
    const responsePath = join(directory, "response.json")
    const bundlePath = join(directory, "bundle.json")
    const publicKeyPath = join(directory, "public.pem")
    const { publicKey, privateKey } = generateKeyPairSync("ed25519")
    writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
    writeFileSync(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }), "utf8")

    const requestResult = run(
      "scripts/live-acceptance-signing-exchange.mjs",
      ["request", "--input", payloadPath, "--public-key", publicKeyPath, "--output", requestPath],
      stateDir,
    )
    expect(requestResult.status, requestResult.stderr).toBe(0)
    const request = JSON.parse(readFileSync(requestPath, "utf8")) as LiveAcceptanceSigningRequest
    const signatureBase64 = sign(
      null,
      buildLiveAcceptanceBundleSigningBytes(request.payload as LiveAcceptanceBundlePayload),
      privateKey,
    ).toString("base64")
    writeFileSync(
      responsePath,
      `${JSON.stringify(
        {
          kind: "knowbee.release.live_acceptance_signature_response",
          schemaVersion: 1,
          requestId: request.requestId,
          algorithm: "ed25519",
          keyId: request.requestedKeyId,
          signatureBase64,
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    const assembleResult = run(
      "scripts/live-acceptance-signing-exchange.mjs",
      [
        "assemble",
        "--request",
        requestPath,
        "--signature-response",
        responsePath,
        "--public-key",
        publicKeyPath,
        "--output",
        bundlePath,
      ],
      stateDir,
    )
    expect(assembleResult.status, assembleResult.stderr).toBe(0)

    const releaseResult = run(
      "scripts/release-package.mjs",
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
    expect(releaseResult.status, releaseResult.stderr).toBe(0)
    const releaseJson = JSON.parse(releaseResult.stdout) as {
      manifest: { liveAcceptance: { status: string; acceptedEvidenceRefs: string[] } }
    }
    expect(releaseJson.manifest.liveAcceptance).toMatchObject({
      status: "admitted",
      acceptedEvidenceRefs: expect.arrayContaining(["live:webui:cli-158", "live:yeonjang:cli-158"]),
    })
    expect(releaseResult.stdout).not.toMatch(/signatureBase64|authorization:live|audit:live/u)

    const overwrite = run(
      "scripts/live-acceptance-signing-exchange.mjs",
      ["request", "--input", payloadPath, "--public-key", publicKeyPath, "--output", requestPath],
      stateDir,
    )
    expect(overwrite.status).not.toBe(0)
    expect(overwrite.stderr).toContain("live_acceptance_exchange_output_failed")

    const payloadLink = join(directory, "payload-link.json")
    symlinkSync(payloadPath, payloadLink)
    const symlink = run(
      "scripts/live-acceptance-signing-exchange.mjs",
      [
        "request",
        "--input",
        payloadLink,
        "--public-key",
        publicKeyPath,
        "--output",
        join(directory, "unused.json"),
      ],
      stateDir,
    )
    expect(symlink.status).not.toBe(0)
    expect(symlink.stderr).toContain("live_acceptance_signing_input_load_failed")
  })
})
