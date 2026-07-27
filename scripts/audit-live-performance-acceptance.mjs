#!/usr/bin/env node

import { createRequire } from "node:module"
import { resolve } from "node:path"

import { parseLivePerformanceAcceptanceCliArguments } from "../packages/core/src/maintenance/live-performance-acceptance-cli.js"
import { SqliteLivePerformanceEvidenceSource } from "../packages/core/src/maintenance/sqlite-live-performance-evidence-source.js"
import { collectLivePerformanceAcceptanceEvidence } from "../packages/core/src/release/live-performance-acceptance-collection.js"
import { SqlitePerformanceAcceptanceAuthorizationRepository } from "../packages/core/src/release/sqlite-performance-acceptance-authorization-repository.js"

const requireFromCore = createRequire(new URL("../packages/core/package.json", import.meta.url))
const BetterSqlite3 = requireFromCore("better-sqlite3")

function reject(reasonCode) {
  process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "rejected", reasonCode })}\n`)
  process.exitCode = 1
}

const parsed = parseLivePerformanceAcceptanceCliArguments(process.argv.slice(2))
if (parsed.status === "rejected") {
  reject(parsed.reasonCode)
} else {
  let database
  try {
    database = new BetterSqlite3(resolve(parsed.databasePath), {
      readonly: true,
      fileMustExist: true,
    })
    const evidence = collectLivePerformanceAcceptanceEvidence({
      selector: parsed.selector,
      runs: parsed.runs,
      repository: new SqlitePerformanceAcceptanceAuthorizationRepository(database),
      source: new SqliteLivePerformanceEvidenceSource(database),
    })
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, kind: "knowbee.audit.live_performance_acceptance", ...evidence }, null, 2)}\n`,
    )
    if (evidence.status !== "accepted") process.exitCode = 1
  } catch {
    reject("runtime_database_open_failed")
  } finally {
    database?.close()
  }
}
