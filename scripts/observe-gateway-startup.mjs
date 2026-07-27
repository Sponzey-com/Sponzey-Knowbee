#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import {
  createStartupEvidenceFilePort,
  observeGatewayStartupEvidence,
} from "../packages/core/dist/runtime/startup.js"

function parseArguments(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("gateway_startup_observer_arguments_invalid")
    }
    parsed[key.slice(2)] = value
  }
  const pid = Number(parsed.pid)
  const minimumStartedAt = Number(parsed["minimum-started-at"])
  const performanceBudgetMs = Number(parsed["performance-budget-ms"])
  const port = Number(parsed.port)
  if (
    !parsed.evidence ||
    !parsed.repo ||
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    !Number.isFinite(minimumStartedAt) ||
    minimumStartedAt < 0 ||
    !Number.isFinite(performanceBudgetMs) ||
    performanceBudgetMs < 1 ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error("gateway_startup_observer_arguments_invalid")
  }
  return {
    evidencePath: resolve(parsed.evidence),
    repositoryRoot: resolve(parsed.repo),
    pid,
    minimumStartedAt,
    performanceBudgetMs,
    port,
  }
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

function processRunning(pid) {
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (error?.code !== "EPERM") return false
  }
  const state = commandOutput("ps", ["-p", String(pid), "-o", "stat="])
  if (state) return !state.startsWith("Z")
  return commandOutput("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-t"]) === String(pid)
}

function repositoryOwned(pid, repositoryRoot) {
  const cwdLines = commandOutput("lsof", [
    "-a",
    "-p",
    String(pid),
    "-d",
    "cwd",
    "-Fn",
  ])
  const cwd = cwdLines
    .split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1)
  const command = commandOutput("ps", ["-p", String(pid), "-o", "command="])
  return cwd?.startsWith(repositoryRoot) === true || command.includes(repositoryRoot)
}

function processListening(pid, port) {
  return commandOutput("lsof", [
    "-a",
    "-p",
    String(pid),
    `-iTCP:${port}`,
    "-sTCP:LISTEN",
    "-t",
  ])
    .split("\n")
    .some((value) => value === String(pid))
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  let evidence = null
  try {
    evidence = await createStartupEvidenceFilePort({
      filePath: args.evidencePath,
    }).readCurrent()
  } catch {
    process.stdout.write(
      JSON.stringify({
        status: "failed",
        elapsedMs: Math.max(0, Date.now() - args.minimumStartedAt),
        reasonCode: "startup_evidence_invalid",
      }),
    )
    return
  }
  const result = await observeGatewayStartupEvidence({
    evidence,
    expectedPid: args.pid,
    minimumStartedAt: args.minimumStartedAt,
    observedAt: Date.now(),
    performanceBudgetMs: args.performanceBudgetMs,
    processPort: {
      async inspect(pid) {
        const running = processRunning(pid)
        return {
          state: running ? "running" : "exited",
          repositoryOwned: running && repositoryOwned(pid, args.repositoryRoot),
          listening: running && processListening(pid, args.port),
        }
      },
    },
  })
  process.stdout.write(JSON.stringify(result))
}

main().catch(() => {
  process.stdout.write(
    JSON.stringify({
      status: "failed",
      elapsedMs: 0,
      reasonCode: "startup_observer_unavailable",
    }),
  )
})
