import type { DoctorMode, DoctorReport, DoctorStatus } from "@knowbee/core"

export interface DoctorCommandOptions {
  quick?: boolean
  full?: boolean
  json?: boolean
  write?: boolean
}

const STATUS_ICON: Record<DoctorStatus, string> = {
  ok: "OK",
  warning: "WARN",
  blocked: "BLOCKED",
  unknown: "UNKNOWN",
}

function resolveMode(options: DoctorCommandOptions): DoctorMode {
  return options.full ? "full" : "quick"
}

function printTextReport(report: DoctorReport, artifactPath: string | null): void {
  console.log(`Knowbee doctor (${report.mode})`)
  console.log(`Status: ${STATUS_ICON[report.overallStatus]}`)
  console.log(`Runtime manifest: ${report.runtimeManifestId}`)
  console.log(`Checks: ok=${report.summary.ok}, warning=${report.summary.warning}, blocked=${report.summary.blocked}, unknown=${report.summary.unknown}`)
  if (artifactPath) console.log(`Report: ${artifactPath}`)
  for (const check of report.checks) {
    const guide = check.guide ? ` | guide: ${check.guide}` : ""
    console.log(`- ${STATUS_ICON[check.status]} ${check.name}: ${check.message}${guide}`)
  }
}

interface DoctorCommandRedactionResult<T = unknown> {
  value: T
}

type DoctorCommandRedactor = <T>(
  value: T,
  options: { audience: "advanced" },
) => DoctorCommandRedactionResult<T>

export function redactDoctorCommandOutput(
  report: DoctorReport,
  artifactPath: string | null,
  redactValue: DoctorCommandRedactor,
): { report: DoctorReport; artifactPath: string | null } {
  return {
    report: redactValue(report, { audience: "advanced" }).value as DoctorReport,
    artifactPath: artifactPath
      ? redactValue(artifactPath, { audience: "advanced" }).value as string
      : null,
  }
}

export async function doctorCommand(options: DoctorCommandOptions): Promise<void> {
  const core = await import("@knowbee/core")
  const mode = resolveMode(options)
  const processContext = core.captureStartupProcessContext()
  const paths = core.createRuntimePaths(processContext.env)
  const config = core.loadConfigSnapshot({
    baseEnv: { ...processContext.env },
    cwd: processContext.cwd,
    paths,
  })
  const report = core.runDoctor({ mode, config, paths })
  const artifactPath = options.write ? core.writeDoctorReportArtifact(report, paths) : null
  const safeOutput = redactDoctorCommandOutput(report, artifactPath, core.redactUiValue)

  if (options.json) {
    console.log(JSON.stringify(safeOutput, null, 2))
    return
  }

  printTextReport(safeOutput.report, safeOutput.artifactPath)
}
