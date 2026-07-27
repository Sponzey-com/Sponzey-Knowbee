import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname } from "node:path"
import {
  GATEWAY_STARTUP_STATES,
  transitionGatewayStartup,
  type GatewayStartupEvent,
  type GatewayStartupSnapshot,
  type GatewayStartupState,
  type GatewayStartupTransitionRejectionReason,
} from "../contracts/gateway-startup-state.js"

export const GATEWAY_STARTUP_EVIDENCE_SCHEMA_VERSION = 1 as const

export interface GatewayStartupEvidence {
  readonly schemaVersion: typeof GATEWAY_STARTUP_EVIDENCE_SCHEMA_VERSION
  readonly startupId: string
  readonly pid: number
  readonly state: GatewayStartupState
  readonly startedAt: number
  readonly changedAt: number
  readonly reasonCode: string | null
}

export interface StartupEvidencePort {
  readCurrent(): Promise<GatewayStartupEvidence | null>
  replaceCurrent(evidence: GatewayStartupEvidence): Promise<void>
}

export interface StartupEvidenceFileSystem {
  makeDirectory(path: string, mode: number): void
  readText(path: string): string
  writeText(path: string, content: string, mode: number): void
  setMode(path: string, mode: number): void
  rename(from: string, to: string): void
  remove(path: string): void
}

const NODE_STARTUP_EVIDENCE_FILE_SYSTEM: StartupEvidenceFileSystem = {
  makeDirectory: (path, mode) => {
    mkdirSync(path, { recursive: true, mode })
  },
  readText: (path) => readFileSync(path, "utf8"),
  writeText: (path, content, mode) => {
    writeFileSync(path, content, { encoding: "utf8", flag: "w", mode })
  },
  setMode: chmodSync,
  rename: renameSync,
  remove: (path) => {
    rmSync(path, { force: true })
  },
}

export type StoreGatewayStartupEvidenceResult =
  | { readonly status: "stored"; readonly evidence: GatewayStartupEvidence }
  | {
    readonly status: "rejected"
    readonly reasonCode:
      | "startup_identity_mismatch"
      | "stale_startup"
      | GatewayStartupTransitionRejectionReason
  }
  | { readonly status: "failed"; readonly reasonCode: "evidence_store_unavailable" }

export function projectGatewayStartupEvidence(
  snapshot: GatewayStartupSnapshot,
): GatewayStartupEvidence {
  return Object.freeze({
    schemaVersion: GATEWAY_STARTUP_EVIDENCE_SCHEMA_VERSION,
    startupId: snapshot.startupId,
    pid: snapshot.pid,
    state: snapshot.state,
    startedAt: snapshot.startedAt,
    changedAt: snapshot.changedAt,
    reasonCode: snapshot.reasonCode,
  })
}

function parseGatewayStartupEvidence(content: string): GatewayStartupEvidence {
  const value = JSON.parse(content) as Partial<GatewayStartupEvidence>
  const validReason =
    value.reasonCode === null ||
    (typeof value.reasonCode === "string" &&
      value.reasonCode.length <= 128 &&
      /^[a-z0-9_]+$/.test(value.reasonCode))
  if (
    value.schemaVersion !== GATEWAY_STARTUP_EVIDENCE_SCHEMA_VERSION ||
    typeof value.startupId !== "string" ||
    value.startupId.length === 0 ||
    value.startupId.length > 128 ||
    !/^[A-Za-z0-9._-]+$/.test(value.startupId) ||
    !Number.isSafeInteger(value.pid) ||
    (value.pid ?? 0) <= 0 ||
    typeof value.state !== "string" ||
    !GATEWAY_STARTUP_STATES.includes(value.state as GatewayStartupState) ||
    !Number.isFinite(value.startedAt) ||
    (value.startedAt ?? -1) < 0 ||
    !Number.isFinite(value.changedAt) ||
    (value.changedAt ?? -1) < (value.startedAt ?? 0) ||
    !validReason
  ) {
    throw new Error("gateway_startup_evidence_invalid")
  }
  return Object.freeze({
    schemaVersion: GATEWAY_STARTUP_EVIDENCE_SCHEMA_VERSION,
    startupId: value.startupId,
    pid: value.pid,
    state: value.state as GatewayStartupState,
    startedAt: value.startedAt,
    changedAt: value.changedAt,
    reasonCode: value.reasonCode,
  }) as GatewayStartupEvidence
}

export function createStartupEvidenceFilePort(input: {
  readonly filePath: string
  readonly fileSystem?: StartupEvidenceFileSystem
}): StartupEvidencePort {
  const fileSystem = input.fileSystem ?? NODE_STARTUP_EVIDENCE_FILE_SYSTEM
  return Object.freeze({
    async readCurrent(): Promise<GatewayStartupEvidence | null> {
      try {
        return parseGatewayStartupEvidence(fileSystem.readText(input.filePath))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
    async replaceCurrent(evidence: GatewayStartupEvidence): Promise<void> {
      const temporaryPath =
        `${input.filePath}.${evidence.startupId}.${evidence.pid}.tmp`
      fileSystem.makeDirectory(dirname(input.filePath), 0o700)
      try {
        fileSystem.writeText(
          temporaryPath,
          `${JSON.stringify(evidence)}\n`,
          0o600,
        )
        fileSystem.setMode(temporaryPath, 0o600)
        fileSystem.rename(temporaryPath, input.filePath)
        fileSystem.setMode(input.filePath, 0o600)
      } catch (error) {
        try {
          fileSystem.remove(temporaryPath)
        } catch {
          // The original bounded storage failure remains authoritative.
        }
        throw error
      }
    },
  })
}

function evidenceSnapshot(evidence: GatewayStartupEvidence): GatewayStartupSnapshot {
  return Object.freeze({
    startupId: evidence.startupId,
    pid: evidence.pid,
    state: evidence.state,
    startedAt: evidence.startedAt,
    changedAt: evidence.changedAt,
    reasonCode: evidence.reasonCode,
  })
}

export async function initializeGatewayStartupEvidence(input: {
  readonly port: StartupEvidencePort
  readonly snapshot: GatewayStartupSnapshot
}): Promise<StoreGatewayStartupEvidenceResult> {
  try {
    const current = await input.port.readCurrent()
    if (
      current &&
      (input.snapshot.startedAt < current.startedAt ||
        (input.snapshot.startedAt === current.startedAt &&
          (input.snapshot.startupId !== current.startupId || input.snapshot.pid !== current.pid)))
    ) {
      return { status: "rejected", reasonCode: "stale_startup" }
    }
    const evidence = projectGatewayStartupEvidence(input.snapshot)
    await input.port.replaceCurrent(evidence)
    return { status: "stored", evidence }
  } catch {
    return { status: "failed", reasonCode: "evidence_store_unavailable" }
  }
}

export async function advanceGatewayStartupEvidence(input: {
  readonly port: StartupEvidencePort
  readonly startupId: string
  readonly pid: number
  readonly event: GatewayStartupEvent
}): Promise<StoreGatewayStartupEvidenceResult> {
  try {
    const current = await input.port.readCurrent()
    if (
      !current ||
      current.startupId !== input.startupId ||
      current.pid !== input.pid
    ) {
      return { status: "rejected", reasonCode: "startup_identity_mismatch" }
    }
    const transition = transitionGatewayStartup(evidenceSnapshot(current), input.event)
    if (transition.status === "rejected") return transition
    const evidence = projectGatewayStartupEvidence(transition.snapshot)
    await input.port.replaceCurrent(evidence)
    return { status: "stored", evidence }
  } catch {
    return { status: "failed", reasonCode: "evidence_store_unavailable" }
  }
}
