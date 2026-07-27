import {
  ARTIFACT_CLEANUP_CONFIRMATION,
  bootstrap,
  captureStartupProcessContext,
  createRuntimePaths,
  executeArtifactCleanup,
  insertAuditLog,
  loadConfigSnapshot,
  previewArtifactCleanup,
  projectArtifactCleanupForUser,
  redactUiValue,
  type ArtifactCleanupExecution,
  type ArtifactCleanupPreview,
  type ArtifactCleanupTargetSummary,
  type ArtifactCleanupUserProjection,
} from "@knowbee/core"

export interface ArtifactCleanupCommandOptions {
  readonly execute?: boolean
  readonly json?: boolean
  readonly audit?: boolean
  readonly maxAgeMs?: string
  readonly releaseOutputDir?: string
  readonly confirm?: string
}

type ArtifactCleanupAuditLogInput = Parameters<typeof insertAuditLog>[0]

export interface ArtifactCleanupCommandOutput {
  readonly ok: boolean
  readonly mode: "preview" | "execute"
  readonly display: ArtifactCleanupUserProjection
  readonly audit?: {
    readonly targets: Array<{
      readonly kind: ArtifactCleanupTargetSummary["kind"]
      readonly label: string
      readonly status: ArtifactCleanupUserProjection["targets"][number]["status"]
      readonly reasonCounts: Record<string, number>
    }>
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("artifact_cleanup_max_age_invalid")
  return parsed
}

function cleanupTargetByKind(
  display: ArtifactCleanupUserProjection,
  kind: ArtifactCleanupTargetSummary["kind"],
): ArtifactCleanupUserProjection["targets"][number] | null {
  return display.targets.find((target) => target.kind === kind) ?? null
}

export function buildArtifactCleanupCommandOutput(
  result: ArtifactCleanupPreview | ArtifactCleanupExecution,
  includeAudit: boolean,
): ArtifactCleanupCommandOutput {
  const display = projectArtifactCleanupForUser(result)
  const output: ArtifactCleanupCommandOutput = {
    ok: result.kind === "knowbee.artifact_cleanup.execution" ? result.confirmed : true,
    mode: result.kind === "knowbee.artifact_cleanup.execution" ? "execute" : "preview",
    display,
    ...(includeAudit
      ? {
          audit: {
            targets: result.targets.map((target) => ({
              kind: target.kind,
              label: cleanupTargetByKind(display, target.kind)?.label ?? target.kind,
              status: cleanupTargetByKind(display, target.kind)?.status ?? "empty",
              reasonCounts: { ...target.reasonCounts },
            })),
          },
        }
      : {}),
  }
  return redactUiValue(output, { audience: "advanced" }).value as ArtifactCleanupCommandOutput
}

export function formatArtifactCleanupCommandText(output: ArtifactCleanupCommandOutput): string {
  const lines = [
    `Artifact cleanup: ${output.mode}`,
    `Status: ${output.ok ? "ready" : "blocked"}`,
  ]
  for (const target of output.display.targets) {
    lines.push(
      `- ${target.label}: ${target.status} | eligible=${target.deleteEligibleFiles}, deleted=${target.deletedFiles}, verified=${target.verifiedDeletedFiles}, skipped=${target.skippedFiles}, attention=${target.attentionCount}`,
    )
  }
  if (output.audit) {
    lines.push("Audit reason counts:")
    for (const target of output.audit.targets) {
      const reasons = Object.entries(target.reasonCounts)
        .map(([reason, count]) => `${reason}=${count}`)
        .join(", ")
      lines.push(`- ${target.label}: ${reasons || "none"}`)
    }
  }
  return lines.join("\n")
}

export function buildArtifactCleanupAuditLogInput(input: {
  readonly result: ArtifactCleanupExecution
  readonly maxAgeMs: number
  readonly releaseOutputDir?: string
  readonly timestamp?: number
}): ArtifactCleanupAuditLogInput {
  const confirmed = input.result.confirmed
  return {
    timestamp: input.timestamp ?? Date.now(),
    session_id: null,
    source: "cli.admin",
    tool_name: "admin.artifact_cleanup",
    params: JSON.stringify({
      maxAgeMs: input.maxAgeMs,
      releaseOutputDir: input.releaseOutputDir ? "[explicit-release-output]" : null,
    }),
    output: JSON.stringify({
      targets: input.result.targets.map((target) => ({
        kind: target.kind,
        directoryName: target.directoryName,
        deletedFiles: target.deletedFiles,
        verifiedDeletedFiles: target.verifiedDeletedFiles,
        failedDeleteFiles: target.failedDeleteFiles,
        eligibleBytes: target.eligibleBytes,
      })),
    }),
    result: confirmed ? "succeeded" : "blocked",
    duration_ms: null,
    approval_required: 1,
    approved_by: confirmed ? "cli_confirmation" : null,
    ...(confirmed
      ? {}
      : {
          error_code: "artifact_cleanup_confirmation_required",
          stop_reason: "missing_explicit_confirmation",
        }),
  }
}

export async function artifactCleanupCommand(
  options: ArtifactCleanupCommandOptions,
): Promise<void> {
  const processContext = captureStartupProcessContext()
  const paths = createRuntimePaths(processContext.env)
  const maxAgeMs = parsePositiveInteger(options.maxAgeMs, 24 * 60 * 60 * 1_000)
  const releaseOutputDir = options.releaseOutputDir?.trim()
  const params = {
    paths,
    maxAgeMs,
    ...(releaseOutputDir ? { releaseOutputDir } : {}),
  }
  const result = options.execute
    ? executeArtifactCleanup({
        ...params,
        confirmation: options.confirm?.trim() ?? "",
      })
    : previewArtifactCleanup(params)
  if (result.kind === "knowbee.artifact_cleanup.execution") {
    const config = loadConfigSnapshot({
      baseEnv: { ...processContext.env },
      cwd: processContext.cwd,
      paths,
    })
    bootstrap(config)
    insertAuditLog(buildArtifactCleanupAuditLogInput({
      result,
      maxAgeMs,
      ...(releaseOutputDir ? { releaseOutputDir } : {}),
    }))
  }
  const output = buildArtifactCleanupCommandOutput(result, options.audit === true)

  if (options.json) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log(formatArtifactCleanupCommandText(output))
    if (!options.execute) {
      console.log(`Execute with: knowbee admin artifact-cleanup --execute --confirm "${ARTIFACT_CLEANUP_CONFIRMATION}"`)
    }
  }

  if (options.execute && !output.ok) throw new Error("artifact_cleanup_confirmation_required")
}
