import { describe, expect, it } from "vitest"
import {
  advanceGatewayStartupEvidence,
  createStartupEvidenceFilePort,
  initializeGatewayStartupEvidence,
  projectGatewayStartupEvidence,
  type GatewayStartupEvidence,
  type StartupEvidenceFileSystem,
  type StartupEvidencePort,
} from "../packages/core/src/runtime/gateway-startup-evidence.ts"
import {
  createGatewayStartup,
  type GatewayStartupSnapshot,
} from "../packages/core/src/contracts/gateway-startup-state.ts"
import {
  beginGatewayStartup,
  getGatewayReadinessSnapshot,
  getGatewayStartupSnapshot,
  transitionGatewayReadiness,
} from "../packages/core/src/runtime/gateway-readiness.ts"
import {
  createGatewayStartupLogPort,
  startGatewayStartup,
  type GatewayStartupLogPort,
  type GatewayStartupProgressPort,
} from "../packages/core/src/runtime/gateway-startup-coordinator.ts"

class MemoryEvidencePort implements StartupEvidencePort {
  current: GatewayStartupEvidence | null = null

  async readCurrent(): Promise<GatewayStartupEvidence | null> {
    return this.current
  }

  async replaceCurrent(evidence: GatewayStartupEvidence): Promise<void> {
    this.current = evidence
  }
}

function startup(): GatewayStartupSnapshot {
  const result = createGatewayStartup({
    startupId: "startup-current",
    pid: 8123,
    startedAt: 10_000,
  })
  if (result.status !== "accepted") throw new Error(result.reasonCode)
  return result.snapshot
}

describe("Gateway startup evidence", () => {
  it("rejects stale startup identity and PID updates", async () => {
    const port = new MemoryEvidencePort()
    await initializeGatewayStartupEvidence({ port, snapshot: startup() })

    await expect(advanceGatewayStartupEvidence({
      port,
      startupId: "startup-stale",
      pid: 8123,
      event: { type: "load_runtime", at: 10_001 },
    })).resolves.toEqual({
      status: "rejected",
      reasonCode: "startup_identity_mismatch",
    })
    await expect(advanceGatewayStartupEvidence({
      port,
      startupId: "startup-current",
      pid: 9999,
      event: { type: "load_runtime", at: 10_001 },
    })).resolves.toEqual({
      status: "rejected",
      reasonCode: "startup_identity_mismatch",
    })
    expect(port.current?.state).toBe("created")
  })

  it("persists only the bounded schema and drops untrusted diagnostic fields", () => {
    const unsafe = {
      ...startup(),
      cwd: "/private/workspace",
      environment: { TOKEN: "secret" },
      mcp: { name: "private-server", command: "secret-command" },
      error: { message: "raw failure payload" },
    } as GatewayStartupSnapshot

    const evidence = projectGatewayStartupEvidence(unsafe)
    expect(Object.keys(evidence).sort()).toEqual([
      "changedAt",
      "pid",
      "reasonCode",
      "schemaVersion",
      "startedAt",
      "startupId",
      "state",
    ])
    expect(JSON.stringify(evidence)).not.toMatch(
      /private|TOKEN|secret|mcp|command|raw failure/i,
    )
  })

  it("uses the canonical transition contract before replacing evidence", async () => {
    const port = new MemoryEvidencePort()
    await initializeGatewayStartupEvidence({ port, snapshot: startup() })

    await expect(advanceGatewayStartupEvidence({
      port,
      startupId: "startup-current",
      pid: 8123,
      event: { type: "runtime_loaded", at: 10_001 },
    })).resolves.toEqual({
      status: "rejected",
      reasonCode: "transition_not_allowed",
    })
    await expect(advanceGatewayStartupEvidence({
      port,
      startupId: "startup-current",
      pid: 8123,
      event: { type: "load_runtime", at: 10_001 },
    })).resolves.toMatchObject({
      status: "stored",
      evidence: { state: "loading_runtime" },
    })
  })

  it("atomically replaces the bounded snapshot with mode 0600", async () => {
    const calls: string[] = []
    const contents = new Map<string, string>()
    const fileSystem: StartupEvidenceFileSystem = {
      makeDirectory(path, mode) {
        calls.push(`mkdir:${path}:${mode.toString(8)}`)
      },
      readText(path) {
        const content = contents.get(path)
        if (content === undefined) {
          const error = new Error("missing") as NodeJS.ErrnoException
          error.code = "ENOENT"
          throw error
        }
        return content
      },
      writeText(path, content, mode) {
        calls.push(`write:${path}:${mode.toString(8)}`)
        contents.set(path, content)
      },
      setMode(path, mode) {
        calls.push(`chmod:${path}:${mode.toString(8)}`)
      },
      rename(from, to) {
        calls.push(`rename:${from}:${to}`)
        const content = contents.get(from)
        if (content === undefined) throw new Error("temporary evidence missing")
        contents.set(to, content)
        contents.delete(from)
      },
      remove(path) {
        calls.push(`remove:${path}`)
        contents.delete(path)
      },
    }
    const port = createStartupEvidenceFilePort({
      filePath: "/state/gateway-startup.json",
      fileSystem,
    })
    const evidence = projectGatewayStartupEvidence(startup())

    await port.replaceCurrent(evidence)

    expect(calls).toEqual([
      "mkdir:/state:700",
      "write:/state/gateway-startup.json.startup-current.8123.tmp:600",
      "chmod:/state/gateway-startup.json.startup-current.8123.tmp:600",
      "rename:/state/gateway-startup.json.startup-current.8123.tmp:/state/gateway-startup.json",
      "chmod:/state/gateway-startup.json:600",
    ])
    await expect(port.readCurrent()).resolves.toEqual(evidence)
  })
})

describe("Gateway public readiness projection", () => {
  it("keeps the existing response fields while hiding internal startup identity and phase", () => {
    beginGatewayStartup({
      startupId: "startup-readiness",
      pid: 8123,
      startedAt: 10_000,
    })
    const internal = getGatewayStartupSnapshot()
    const readiness = getGatewayReadinessSnapshot()

    expect(internal).toMatchObject({
      startupId: "startup-readiness",
      pid: 8123,
      state: "loading_runtime",
    })
    expect(readiness).toMatchObject({
      status: "starting",
      reasonCode: "bootstrap_pending",
    })
    expect(Object.keys(readiness).sort()).toEqual([
      "changedAt",
      "reasonCode",
      "status",
    ])
  })

  it("rejects backward and terminal transitions without changing public readiness", () => {
    beginGatewayStartup({
      startupId: "startup-transition",
      pid: 8123,
      startedAt: 10_000,
    })
    expect(transitionGatewayReadiness({
      type: "runtime_loaded",
      at: 10_001,
    }).status).toBe("accepted")
    expect(transitionGatewayReadiness({
      type: "load_runtime",
      at: 10_002,
    })).toMatchObject({
      status: "rejected",
      reasonCode: "transition_not_allowed",
    })
    expect(transitionGatewayReadiness({
      type: "fail",
      at: 10_003,
      reasonCode: "core_initialization_failed",
    }).status).toBe("accepted")
    expect(transitionGatewayReadiness({
      type: "core_initialized",
      at: 10_004,
    })).toMatchObject({
      status: "rejected",
      reasonCode: "terminal_state_exit_forbidden",
    })
    expect(getGatewayReadinessSnapshot()).toMatchObject({
      status: "failed",
      reasonCode: "core_initialization_failed",
    })
  })
})

describe("Gateway startup progress coordinator", () => {
  it("records the full phase path with one startup identity", async () => {
    const port = new MemoryEvidencePort()
    const started = await startGatewayStartup({
      startupId: "startup-coordinated",
      pid: 8123,
      startedAt: 10_000,
      evidencePort: port,
    })
    const progress: GatewayStartupProgressPort = started.progress

    expect(started).toMatchObject({
      status: "started",
      evidence: "stored",
      progress: {
        startupId: "startup-coordinated",
        pid: 8123,
      },
    })
    expect(port.current).toMatchObject({
      startupId: "startup-coordinated",
      pid: 8123,
      state: "loading_runtime",
    })

    for (const [type, state] of [
      ["runtime_loaded", "initializing_core"],
      ["core_initialized", "activating_channels"],
      ["channels_activated", "binding_http"],
      ["http_bound", "loading_plugins"],
      ["plugins_loaded", "ready"],
    ] as const) {
      await expect(progress.advance({
        type,
        at: progress.getSnapshot().changedAt + 1,
      })).resolves.toMatchObject({
        status: "advanced",
        evidence: "stored",
        snapshot: {
          startupId: "startup-coordinated",
          pid: 8123,
          state,
        },
      })
    }
  })

  it("keeps advancing readiness when the evidence writer is unavailable", async () => {
    const unavailablePort: StartupEvidencePort = {
      async readCurrent() {
        throw new Error("disk unavailable")
      },
      async replaceCurrent() {
        throw new Error("disk unavailable")
      },
    }
    const started = await startGatewayStartup({
      startupId: "startup-no-evidence",
      pid: 8123,
      startedAt: 20_000,
      evidencePort: unavailablePort,
    })

    expect(started).toMatchObject({
      status: "started",
      evidence: "unavailable",
    })
    await expect(started.progress.advance({
      type: "runtime_loaded",
      at: 20_001,
    })).resolves.toMatchObject({
      status: "advanced",
      evidence: "unavailable",
      snapshot: { state: "initializing_core" },
    })
    expect(started.progress.getSnapshot().state).toBe("initializing_core")
  })

  it("logs only user-impacting terminal changes as Product Log events", async () => {
    const product: unknown[] = []
    const fieldDebug: unknown[] = []
    const logger: GatewayStartupLogPort = {
      product(event) {
        product.push(event)
      },
      fieldDebug(event) {
        fieldDebug.push(event)
      },
    }
    const port = new MemoryEvidencePort()
    const started = await startGatewayStartup({
      startupId: "startup-logged",
      pid: 8123,
      startedAt: 30_000,
      evidencePort: port,
      logger,
    })
    if (started.status !== "started") throw new Error(started.reasonCode)

    for (const type of [
      "runtime_loaded",
      "core_initialized",
      "channels_activated",
      "http_bound",
      "plugins_loaded",
    ] as const) {
      await started.progress.advance({
        type,
        at: started.progress.getSnapshot().changedAt + 1,
      })
    }

    expect(product).toEqual([
      {
        event: "started",
        startupId: "startup-logged",
        elapsedMs: 0,
        reasonCode: null,
      },
      {
        event: "ready",
        startupId: "startup-logged",
        elapsedMs: 5,
        reasonCode: null,
      },
    ])
    expect(fieldDebug).toEqual([])
  })

  it("logs evidence failure through a bounded Field Debug event", async () => {
    const product: unknown[] = []
    const fieldDebug: unknown[] = []
    const logger = createGatewayStartupLogPort({
      product(_message, context) {
        product.push(context)
      },
      fieldDebug(_message, context) {
        fieldDebug.push(context)
      },
    })
    const unavailablePort: StartupEvidencePort = {
      async readCurrent() {
        throw new Error("raw /private/path TOKEN=secret mcp-command")
      },
      async replaceCurrent() {
        throw new Error("raw /private/path TOKEN=secret mcp-command")
      },
    }

    const started = await startGatewayStartup({
      startupId: "startup-bounded-log",
      pid: 8123,
      startedAt: 40_000,
      evidencePort: unavailablePort,
      logger,
    })

    expect(started.status).toBe("started")
    expect(product).toEqual([{
      event: "started",
      startupId: "startup-bounded-log",
      elapsedMs: 0,
      reasonCode: null,
    }])
    expect(fieldDebug).toEqual([{
      event: "evidence_unavailable",
      startupId: "startup-bounded-log",
      state: "loading_runtime",
      reasonCode: "evidence_store_unavailable",
    }])
    expect(JSON.stringify(fieldDebug)).not.toMatch(
      /private|TOKEN|secret|mcp-command|raw/i,
    )
  })
})
