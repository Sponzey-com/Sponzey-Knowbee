#!/usr/bin/env node

import { createRequire } from "node:module"
import { resolve } from "node:path"

import { parseLivePerformanceCliArguments } from "../../packages/core/src/maintenance/live-performance-cli.js"
import { collectLivePerformanceEvidence } from "../../packages/core/src/maintenance/live-performance-evidence.js"
import { SqliteLivePerformanceEvidenceSource } from "../../packages/core/src/maintenance/sqlite-live-performance-evidence-source.js"

const requireFromCore = createRequire(new URL("../../packages/core/package.json", import.meta.url))
const BetterSqlite3 = requireFromCore("better-sqlite3")

function writeRejected(reasonCode) {
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "rejected", reasonCode })}\n`)
  process.exitCode = 1
}

const parsed = parseLivePerformanceCliArguments(process.argv.slice(2))
if (parsed.status === "rejected") {
  writeRejected(parsed.reasonCode)
} else {
  let database
  try {
    database = new BetterSqlite3(resolve(parsed.databasePath), {
      readonly: true,
      fileMustExist: true,
    })
    const result = collectLivePerformanceEvidence({
      source: new SqliteLivePerformanceEvidenceSource(database),
      runId: parsed.runId,
      flowId: parsed.flowId,
    })
    if (result.status === "rejected") writeRejected(result.reasonCode)
    else {
      process.stdout.write(
        `${JSON.stringify(
          {
            schemaVersion: 1,
            kind: "knowbee.audit.live_performance_evidence",
            status: "ready",
            sample: result.sample,
          },
          null,
          2,
        )}\n`,
      )
    }
  } catch {
    writeRejected("runtime_database_open_failed")
  } finally {
    database?.close()
  }
}
