#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildWorktreeBaselineReceipt } from "../../packages/core/src/maintenance/worktree-baseline.js"

export function parseGitPorcelainV1Z(buffer) {
  const fields = buffer.toString("utf8").split("\0")
  if (fields.at(-1) === "") fields.pop()
  const changes = []
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (field.length < 4 || field[2] !== " ") {
      throw new Error("git status porcelain record is malformed")
    }
    const status = field.slice(0, 2)
    const path = field.slice(3)
    if (status.includes("R") || status.includes("C")) {
      const originalPath = fields[index + 1]
      if (!originalPath) throw new Error("git rename/copy record is missing its original path")
      changes.push({ status, path, originalPath })
      index += 1
    } else {
      changes.push({ status, path })
    }
  }
  return changes
}

function defaultRunGit({ cwd, args }) {
  return execFileSync("git", args, { cwd, encoding: "buffer" })
}

export function createWorktreeBaseline(input) {
  const runGit = input.runGit ?? defaultRunGit
  const headSha = runGit({ cwd: input.repositoryRoot, args: ["rev-parse", "HEAD"] })
    .toString("utf8")
    .trim()
  if (!headSha) throw new Error("git HEAD SHA is missing")
  const headCommittedAt = runGit({
    cwd: input.repositoryRoot,
    args: ["show", "-s", "--format=%cI", "HEAD"],
  })
    .toString("utf8")
    .trim()
  if (!headCommittedAt) throw new Error("git HEAD commit timestamp is missing")
  const changes = parseGitPorcelainV1Z(
    runGit({
      cwd: input.repositoryRoot,
      args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    }),
  )
  return buildWorktreeBaselineReceipt({
    repositoryRoot: input.repositoryRoot,
    headSha,
    headCommittedAt,
    capturedAt: input.capturedAt,
    changes,
  })
}

function parseArguments(argv) {
  const values = [...argv]
  const repositoryRoot = resolve(
    values[0] && values[0] !== "--output"
      ? values.shift()
      : join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
  )
  let outputPath = ""
  if (values[0] === "--output") {
    values.shift()
    outputPath = values.shift() ?? ""
  }
  if (values.length > 0 || (argv.includes("--output") && !outputPath)) {
    throw new Error("usage: audit-worktree-baseline.mjs [repository-root] [--output output-path]")
  }
  return { repositoryRoot, outputPath }
}

function resolveOutputPath(repositoryRoot, outputPath) {
  return isAbsolute(outputPath) ? outputPath : join(repositoryRoot, outputPath)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { repositoryRoot, outputPath } = parseArguments(process.argv.slice(2))
    const receipt = createWorktreeBaseline({
      repositoryRoot,
      capturedAt: new Date().toISOString(),
    })
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`
    if (outputPath) {
      const absoluteOutput = resolveOutputPath(repositoryRoot, outputPath)
      mkdirSync(dirname(absoluteOutput), { recursive: true })
      writeFileSync(absoluteOutput, serialized, "utf8")
    } else {
      process.stdout.write(serialized)
    }
    if (!receipt.complete) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
