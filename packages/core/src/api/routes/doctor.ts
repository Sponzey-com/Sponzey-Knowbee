import type { FastifyInstance } from "fastify"
import { basename } from "node:path"
import type { RuntimePaths } from "../../config/paths.js"
import { runDoctor, writeDoctorReportArtifact, type DoctorMode, type DoctorReport } from "../../diagnostics/doctor.js"
import { redactUiValue } from "../../ui/redaction.js"
import { authMiddleware } from "../middleware/auth.js"
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js"

const INTERNAL_PATH_REDACTION = "[internal-path-redacted]"

function resolveMode(value: unknown): DoctorMode {
  return value === "full" ? "full" : "quick"
}

function uniqueKnownPaths(report: DoctorReport, artifactPath: string | null, paths: RuntimePaths): string[] {
  const candidates = [
    paths.stateDir,
    paths.configFile,
    paths.dbFile,
    paths.memoryDbFile,
    report.manifest.app.workspaceRoot,
    report.manifest.process.cwd,
    report.manifest.database.path,
    report.manifest.memory.dbPath,
    report.manifest.provider.resolverPath,
    artifactPath,
  ]
  return Array.from(new Set(candidates.filter((path): path is string => typeof path === "string" && path.length > 0)))
    .sort((left, right) => right.length - left.length)
}

function redactKnownPathText(value: string, knownPaths: string): string
function redactKnownPathText(value: string, knownPaths: string[]): string
function redactKnownPathText(value: string, knownPaths: string | string[]): string {
  let output = value
  for (const path of Array.isArray(knownPaths) ? knownPaths : [knownPaths]) {
    output = output.split(path).join(INTERNAL_PATH_REDACTION)
  }
  return output
}

function redactKnownLocalPaths(value: unknown, knownPaths: string[]): unknown {
  if (typeof value === "string") return redactKnownPathText(value, knownPaths)
  if (Array.isArray(value)) return value.map((item) => redactKnownLocalPaths(item, knownPaths))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      redactKnownLocalPaths(item, knownPaths),
    ]))
  }
  return value
}

function sanitizeRouteValue<T>(value: T, knownPaths: string[]): T {
  return redactUiValue(redactKnownLocalPaths(value, knownPaths), { audience: "advanced" }).value as T
}

function projectDoctorReportForRoute(report: DoctorReport, artifactPath: string | null, paths: RuntimePaths): Record<string, unknown> {
  const knownPaths = uniqueKnownPaths(report, artifactPath, paths)
  return {
    kind: report.kind,
    version: report.version,
    id: report.id,
    mode: report.mode,
    createdAt: report.createdAt,
    overallStatus: report.overallStatus,
    runtimeManifestId: report.runtimeManifestId,
    checks: sanitizeRouteValue(report.checks, knownPaths),
    summary: report.summary,
    manifest: {
      id: report.manifest.id,
      app: {
        displayVersion: report.manifest.app.displayVersion,
        gitDescribe: report.manifest.app.gitDescribe,
      },
      database: {
        currentVersion: report.manifest.database.currentVersion,
        latestVersion: report.manifest.database.latestVersion,
        upToDate: report.manifest.database.upToDate,
      },
      promptSources: {
        count: report.manifest.promptSources.count,
        checksum: report.manifest.promptSources.checksum,
        localeParityOk: report.manifest.promptSources.localeParityOk,
      },
      provider: {
        provider: report.manifest.provider.provider,
        model: report.manifest.provider.model,
        profileId: report.manifest.provider.profileId,
        runtimeProfileId: report.manifest.provider.runtimeProfileId,
        capabilityMatrix: {
          adapterType: report.manifest.provider.capabilityMatrix.adapterType,
          authType: report.manifest.provider.capabilityMatrix.authType,
          endpointMismatch: report.manifest.provider.capabilityMatrix.endpointMismatch,
          embeddings: report.manifest.provider.capabilityMatrix.embeddings,
          lastCheckResult: report.manifest.provider.capabilityMatrix.lastCheckResult,
        },
      },
      adminUi: report.manifest.adminUi,
    },
  }
}

export function registerDoctorRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { mode?: string; json?: string; write?: string } }>("/api/doctor", { preHandler: authMiddleware }, async (req) => {
    const config = getApiRuntimeConfig(req)
    const paths = getApiRuntimePaths(req)
    const report = runDoctor({ mode: resolveMode(req.query.mode), config, paths })
    const artifactPath = req.query.write === "1" || req.query.write === "true"
      ? writeDoctorReportArtifact(report, paths)
      : null
    return {
      ok: true,
      report: projectDoctorReportForRoute(report, artifactPath, paths),
      artifactPath: artifactPath ? INTERNAL_PATH_REDACTION : null,
      artifactId: artifactPath ? basename(artifactPath) : null,
    }
  })
}
