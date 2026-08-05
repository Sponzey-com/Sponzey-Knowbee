#!/usr/bin/env node

const command = process.argv[2]

if (command === "serve" || command === "start") {
  const coreServeExport = "@knowbee/core/serve"
  const { runServeEntry } = await import(coreServeExport) as
    typeof import("./serve-entry.js")
  await runServeEntry()
} else {
  await import("./index.js")
}
