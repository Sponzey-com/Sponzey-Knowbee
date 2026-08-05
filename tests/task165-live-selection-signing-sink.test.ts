import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type LiveAcceptanceRouteExecutor,
  registerLiveAcceptanceRoute,
} from "../packages/core/src/api/routes/live-acceptance.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  type LiveAcceptanceExecutionRequest,
  validateLiveAcceptanceExecutionRequest,
} from "../packages/core/src/release/live-acceptance-execution-request.ts"
import type { LiveAcceptanceSigningRequest } from "../packages/core/src/release/live-acceptance-signing-exchange.ts"
import {
  LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY,
  type AtomicSigningRequestFileSystem,
  createLiveAcceptanceSigningRequestFileSink,
} from "../packages/core/src/release/live-acceptance-signing-request-file-sink.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: {
    method: string
    url: string
    payload?: unknown
    headers?: Record<string, string>
  }): Promise<{ statusCode: number; json(): unknown }>
}

const NOW = Date.parse("2026-07-17T18:00:00.000Z")
const TOKEN = "task165-route-token"
const tempDirs: string[] = []

function selection() {
  return {
    extensions: [
      {
        capability: "skill" as const,
        agentId: "agent:release",
        bindingId: "binding:release:skill",
        catalogId: "skill:release-probe",
        toolName: "release_skill_probe",
        readOnly: true as const,
        params: { probe: "health" },
      },
      {
        capability: "mcp" as const,
        agentId: "agent:release",
        bindingId: "binding:release:mcp",
        catalogId: "release-probe",
        toolName: "mcp__release_probe__health",
        readOnly: true as const,
        params: { scope: ["status"] },
      },
    ] as const,
    yeonjang: {
      instanceId: "instance:office-mac",
      sessionId: "session:office-mac:11",
      method: "system.info" as const,
      readOnly: true as const,
    },
  }
}

function requestFixture(): LiveAcceptanceExecutionRequest {
  return {
    kind: "knowbee.release.live_acceptance_execution_request",
    schemaVersion: 2,
    candidate: { appVersion: "0.2.16", gitTag: "v0.2.16", gitCommit: "abc123" },
    authorization: {
      authorizationId: "authorization:task165",
      auditEventId: "audit:authorization:task165",
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
    },
    selection: selection(),
    requestedKeyId: `sha256:${"a".repeat(64)}`,
  }
}

function signingRequest(): LiveAcceptanceSigningRequest {
  return {
    kind: "knowbee.release.live_acceptance_signing_request",
    schemaVersion: 1,
    requestId: `live-request:${"b".repeat(64)}:${"a".repeat(64)}`,
    requestedKeyId: `sha256:${"a".repeat(64)}`,
    payloadSha256: `sha256:${"b".repeat(64)}`,
    payload: {
      kind: "knowbee.release.live_acceptance_bundle",
      schemaVersion: 2,
      candidate: requestFixture().candidate,
      approval: {
        decision: "approved",
        authorizationStatus: "active",
        authorizationId: "authorization:task165",
        auditEventId: "audit:task165",
        principalType: "authenticated_user",
        principalId: "operator:task165",
        authenticationId: "authentication:task165",
        roles: ["release_administrator"],
        approvedAt: NOW - 1_000,
        expiresAt: NOW + 60_000,
        redactionStatus: "verified",
      },
      evidence: [],
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) rmSync(path, { recursive: true, force: true })
  }
})

describe("Task 165 exact live execution selection", () => {
  it("verifies and deeply freezes one Skill, one MCP and one exact Yeonjang target", () => {
    const validated = validateLiveAcceptanceExecutionRequest(requestFixture(), NOW)

    expect(validated).toEqual({ status: "verified", request: requestFixture() })
    if (validated.status !== "verified") throw new Error(validated.reasonCode)
    expect(Object.isFrozen(validated.request.selection)).toBe(true)
    expect(Object.isFrozen(validated.request.selection.extensions)).toBe(true)
    expect(Object.isFrozen(validated.request.selection.extensions[0]?.params)).toBe(true)
  })

  it.each([
    [{ ...requestFixture(), schemaVersion: 1 }, "live_acceptance_request_schema_invalid"],
    [
      {
        ...requestFixture(),
        selection: {
          ...selection(),
          extensions: [selection().extensions[0], selection().extensions[0]],
        },
      },
      "live_acceptance_request_selection_invalid",
    ],
    [
      {
        ...requestFixture(),
        selection: {
          ...selection(),
          yeonjang: { ...selection().yeonjang, method: "shell.exec" },
        },
      },
      "live_acceptance_request_selection_invalid",
    ],
    [
      {
        ...requestFixture(),
        selection: {
          ...selection(),
          extensions: [
            {
              ...selection().extensions[0],
              params: { nested: { one: { two: { three: { four: "too-deep" } } } } },
            },
            selection().extensions[1],
          ],
        },
      },
      "live_acceptance_request_selection_invalid",
    ],
  ])("rejects an implicit or unsafe selection", (value, reasonCode) => {
    expect(validateLiveAcceptanceExecutionRequest(value, NOW)).toEqual({
      status: "rejected",
      reasonCode,
    })
  })

  it("passes only the validated frozen selection to the authenticated executor", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task165-route-"))
    tempDirs.push(root)
    const app = Fastify({ logger: false })
    const config = structuredClone(DEFAULT_CONFIG)
    config.webui.auth = { enabled: true, token: TOKEN }
    installApiRuntimeConfig(
      app as never,
      config,
      createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false }),
    )
    const execute = vi.fn<LiveAcceptanceRouteExecutor>(async () => ({
      status: "blocked",
      blockers: [{ capability: "web", reasonCode: "not-ready" }],
      events: [{ state: "blocked" }],
    }))
    registerLiveAcceptanceRoute(app as never, { enabled: true, execute, now: () => NOW })
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/live-acceptance/runs",
        payload: requestFixture(),
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      expect(response.statusCode).toBe(200)
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ selection: requestFixture().selection }),
      )
      const passed = execute.mock.calls[0]?.[0].selection
      expect(Object.isFrozen(passed)).toBe(true)
      expect(JSON.stringify(response.json())).not.toContain("release_skill_probe")
    } finally {
      await app.close()
    }
  })
})

describe("Task 165 atomic signing-request file sink", () => {
  function outputRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task165-signing-"))
    tempDirs.push(root)
    const output = join(root, "signing-requests")
    mkdirSync(output, { mode: 0o700 })
    return output
  }

  it("publishes one complete regular JSON file and refuses overwrite", async () => {
    const outputDir = outputRoot()
    const sink = createLiveAcceptanceSigningRequestFileSink({
      outputDir,
      randomId: () => "task165",
      maxBytes: 64 * 1024,
    })

    await expect(sink.write(signingRequest())).resolves.toEqual({ status: "written" })
    const expectedPath = join(outputDir, `${"b".repeat(64)}-${"a".repeat(64)}.json`)
    const stat = lstatSync(expectedPath)
    expect(stat.isFile()).toBe(true)
    expect(stat.isSymbolicLink()).toBe(false)
    if (process.platform !== "win32") expect(stat.mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(expectedPath, "utf8"))).toEqual(signingRequest())
    await expect(sink.write(signingRequest())).resolves.toEqual({
      status: "rejected",
      reasonCode: "live_signing_request_destination_exists",
    })
  })

  it("keeps the raw signing artifact bounded to external signature inputs", async () => {
    expect(LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY).toEqual({
      purpose: "external_release_signature",
      audience: "external_signer",
      redaction: "raw_by_design",
      access: "filesystem_private_file",
      retention: "operator_cleanup",
      rawDataAllowed: true,
      route: "none",
      directoryName: "release/live-acceptance-signing-requests",
      fileMode: "0600",
    })

    const outputDir = outputRoot()
    const sink = createLiveAcceptanceSigningRequestFileSink({
      outputDir,
      randomId: () => "task165-bounded",
    })

    await expect(sink.write(signingRequest())).resolves.toEqual({ status: "written" })
    const expectedPath = join(outputDir, `${"b".repeat(64)}-${"a".repeat(64)}.json`)
    const artifactText = readFileSync(expectedPath, "utf8")
    const artifact = JSON.parse(artifactText) as Record<string, unknown>

    expect(Object.keys(artifact).sort()).toEqual([
      "kind",
      "payload",
      "payloadSha256",
      "requestedKeyId",
      "requestId",
      "schemaVersion",
    ].sort())
    expect(artifactText).not.toMatch(/requestText|resultDiagnosis|valueBase64|yeonjang-goal-validation|receipt payload|raw observed state|structured diagnosis payload|DB row/u)
    expect(artifactText).not.toMatch(/operationId|operation:/u)
  })

  it("rejects missing and symlink roots before creating an artifact", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task165-roots-"))
    tempDirs.push(root)
    const real = join(root, "real")
    const linked = join(root, "linked")
    mkdirSync(real)
    symlinkSync(real, linked, "dir")

    await expect(
      createLiveAcceptanceSigningRequestFileSink({ outputDir: join(root, "missing") }).write(
        signingRequest(),
      ),
    ).resolves.toEqual({ status: "rejected", reasonCode: "live_signing_request_root_invalid" })
    await expect(
      createLiveAcceptanceSigningRequestFileSink({ outputDir: linked }).write(signingRequest()),
    ).resolves.toEqual({ status: "rejected", reasonCode: "live_signing_request_root_invalid" })
    expect(readdirSync(real)).toEqual([])
  })

  it("removes a temporary file when writing fails", async () => {
    const outputDir = outputRoot()
    const unlink = vi.fn(async () => undefined)
    const fileSystem: AtomicSigningRequestFileSystem = {
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (path) => path,
      openExclusive: async () => ({
        writeFile: async () => {
          throw new Error("private write failure")
        },
        sync: async () => undefined,
        close: async () => undefined,
      }),
      link: async () => undefined,
      unlink,
    }
    const result = await createLiveAcceptanceSigningRequestFileSink({
      outputDir,
      fileSystem,
      randomId: () => "failed-write",
    }).write(signingRequest())

    expect(result).toEqual({ status: "rejected", reasonCode: "live_signing_request_write_failed" })
    expect(unlink).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toContain("private write failure")
  })

  it("does not read runtime environment or own private signing material", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/release/live-acceptance-signing-request-file-sink.ts"),
      "utf8",
    )
    expect(source).not.toContain("process.env")
    expect(source).not.toMatch(/privateKey|createPrivateKey|sign\(/u)
    expect(source).not.toContain("rename(")
  })
})
