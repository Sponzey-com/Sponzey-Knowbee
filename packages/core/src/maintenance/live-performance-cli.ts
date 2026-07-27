export type LivePerformanceCliArgumentsResult =
  | { status: "ready"; databasePath: string; runId: string; flowId: string }
  | { status: "rejected"; reasonCode: string }

export function parseLivePerformanceCliArguments(
  argv: readonly string[],
): LivePerformanceCliArgumentsResult {
  const argumentsToParse = argv[0] === "--" ? argv.slice(1) : argv
  const optionNames = new Set(["--database", "--run-id", "--flow-id"])
  const values = new Map<string, string>()
  for (let index = 0; index < argumentsToParse.length; index += 2) {
    const option = argumentsToParse[index]
    if (!option || !optionNames.has(option)) {
      return { status: "rejected", reasonCode: "cli_argument_unknown" }
    }
    if (values.has(option)) {
      return { status: "rejected", reasonCode: "cli_argument_duplicate" }
    }
    const value = argumentsToParse[index + 1]?.trim()
    if (!value || value.startsWith("--")) {
      return { status: "rejected", reasonCode: "cli_argument_missing" }
    }
    values.set(option, value)
  }
  const databasePath = values.get("--database")
  const runId = values.get("--run-id")
  const flowId = values.get("--flow-id")
  if (!databasePath || !runId || !flowId) {
    return { status: "rejected", reasonCode: "cli_argument_missing" }
  }
  return { status: "ready", databasePath, runId, flowId }
}
