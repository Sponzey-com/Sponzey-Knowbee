#!/usr/bin/env node

import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { reportCliCommandFailure } from "./command-error.js"
import { serveCommand } from "./commands/serve.js"

export { serveCommand }

export async function runServeEntry(): Promise<void> {
  try {
    await serveCommand()
  } catch (error) {
    reportCliCommandFailure(error, "fatal")
  }
}

function isDirectServeEntry(): boolean {
  const executablePath = process.argv[1]
  return executablePath !== undefined &&
    resolve(executablePath) === fileURLToPath(import.meta.url)
}

if (isDirectServeEntry()) await runServeEntry()
