#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { auditRepresentativeFlowBaseline } from "../packages/core/src/maintenance/performance-baseline.js"

const FIXTURE_VERSION = "phase0:representative-flows:v1"

const FIXTURE_SAMPLES = [
  ["direct_answer", 820, 1, 720, 180, 0.0042, 1, 0, 680, 420],
  ["current_fact_read", 1_940, 2, 1_420, 320, 0.011, 2, 18, 1_120, 2_840],
  ["tool_write", 2_480, 2, 1_680, 360, 0.0135, 2, 42, 1_460, 3_320],
  ["child_delegation", 3_600, 3, 4_200, 1_100, 0.081, 3, 120, 2_940, 6_480],
  ["cancel", 540, 1, 640, 140, 0.0034, 1, 12, 920, 760],
].map((value, index) => ({
  flowId: value[0],
  sampleId: `fixture:${index}`,
  durationMs: value[1],
  llmCallCount: value[2],
  inputTokens: value[3],
  outputTokens: value[4],
  costEstimateUsd: value[5],
  attemptCount: value[6],
  queueWaitMs: value[7],
  eventBytes: value[8],
  evidenceBytes: value[9],
}))

export function createPerformanceCostBaseline() {
  return auditRepresentativeFlowBaseline({
    fixtureVersion: FIXTURE_VERSION,
    sourceKind: "deterministic_fixture",
    samples: FIXTURE_SAMPLES,
  })
}

function parseArguments(argv) {
  const values = [...argv]
  const repositoryRoot = resolve(
    values[0] && values[0] !== "--output"
      ? values.shift()
      : join(dirname(fileURLToPath(import.meta.url)), ".."),
  )
  let outputPath = ""
  if (values[0] === "--output") {
    values.shift()
    outputPath = values.shift() ?? ""
  }
  if (values.length > 0 || (argv.includes("--output") && !outputPath)) {
    throw new Error(
      "usage: audit-performance-cost-baseline.mjs [repository-root] [--output output-path]",
    )
  }
  return { repositoryRoot, outputPath }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { repositoryRoot, outputPath } = parseArguments(process.argv.slice(2))
    const result = createPerformanceCostBaseline()
    const serialized = `${JSON.stringify(result, null, 2)}\n`
    if (outputPath) {
      const absolute = isAbsolute(outputPath) ? outputPath : join(repositoryRoot, outputPath)
      writeFileSync(absolute, serialized, "utf8")
    } else process.stdout.write(serialized)
    if (!result.complete) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
