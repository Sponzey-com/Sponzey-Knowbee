#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { runInstallerReleaseReadinessCli } from "./lib/installer-release-readiness-cli.mjs"

const execFile = promisify(execFileCallback)

async function ghJson(args) {
  try {
    const { stdout } = await execFile("gh", args, { maxBuffer: 256 * 1024 })
    return JSON.parse(stdout)
  } catch {
    return undefined
  }
}

async function queryGitHub(request) {
  if (request.kind === "environments") {
    return ghJson(["api", `repos/${request.repo}/environments`])
  }
  if (request.kind === "runners") {
    return ghJson(["api", `repos/${request.repo}/actions/runners`])
  }
  return ghJson([
    "release",
    "view",
    request.releaseTag,
    "--repo",
    request.repo,
    "--json",
    "tagName,isPrerelease",
  ])
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await runInstallerReleaseReadinessCli(process.argv.slice(2), queryGitHub)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}
