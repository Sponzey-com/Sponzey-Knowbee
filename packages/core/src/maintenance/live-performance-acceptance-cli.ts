import {
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  type RepresentativeFlowId,
} from "./performance-baseline.js"

export type LivePerformanceAcceptanceCliArguments =
  | {
      status: "ready"
      databasePath: string
      selector: { matrixId: string; matrixVersion: number; baselineVersion: string }
      runs: Array<{ flowId: RepresentativeFlowId; runId: string }>
    }
  | { status: "rejected"; reasonCode: string }

export function parseLivePerformanceAcceptanceCliArguments(
  argv: readonly string[],
): LivePerformanceAcceptanceCliArguments {
  let databasePath = ""
  let matrixId = ""
  let matrixVersionText = ""
  let baselineVersion = ""
  const rawRuns: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (
      argument === "--database" ||
      argument === "--matrix-id" ||
      argument === "--matrix-version" ||
      argument === "--baseline-version" ||
      argument === "--run"
    ) {
      if (!value || value.startsWith("--")) {
        return { status: "rejected", reasonCode: "argument_value_required" }
      }
      if (argument === "--database") databasePath = value
      else if (argument === "--matrix-id") matrixId = value
      else if (argument === "--matrix-version") matrixVersionText = value
      else if (argument === "--baseline-version") baselineVersion = value
      else rawRuns.push(value)
      index += 1
      continue
    }
    return { status: "rejected", reasonCode: "argument_unknown" }
  }
  if (!databasePath.trim()) return { status: "rejected", reasonCode: "database_path_required" }
  if (!matrixId.trim()) return { status: "rejected", reasonCode: "matrix_id_required" }
  if (!/^[1-9][0-9]*$/.test(matrixVersionText)) {
    return { status: "rejected", reasonCode: "matrix_version_invalid" }
  }
  const matrixVersion = Number(matrixVersionText)
  if (!Number.isSafeInteger(matrixVersion)) {
    return { status: "rejected", reasonCode: "matrix_version_invalid" }
  }
  if (!baselineVersion.trim()) {
    return { status: "rejected", reasonCode: "baseline_version_required" }
  }

  const runs: Array<{ flowId: RepresentativeFlowId; runId: string }> = []
  const seen = new Set<string>()
  for (const rawRun of rawRuns) {
    const separator = rawRun.indexOf("=")
    const flowId = rawRun.slice(0, separator)
    const runId = rawRun.slice(separator + 1)
    if (separator < 1 || !runId.trim()) {
      return { status: "rejected", reasonCode: "performance_run_binding_invalid" }
    }
    if (!REQUIRED_REPRESENTATIVE_FLOW_IDS.includes(flowId as RepresentativeFlowId)) {
      return { status: "rejected", reasonCode: `performance_flow_unknown:${flowId}` }
    }
    if (seen.has(flowId)) {
      return { status: "rejected", reasonCode: `performance_flow_duplicate:${flowId}` }
    }
    seen.add(flowId)
    runs.push({ flowId: flowId as RepresentativeFlowId, runId })
  }
  for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
    if (!seen.has(flowId)) {
      return { status: "rejected", reasonCode: `performance_flow_missing:${flowId}` }
    }
  }
  return {
    status: "ready",
    databasePath,
    selector: { matrixId, matrixVersion, baselineVersion },
    runs,
  }
}
