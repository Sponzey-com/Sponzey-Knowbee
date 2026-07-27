import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { analyzeUiSourcePatterns } from "./lib/ui-pattern-inventory.mjs"

const root = path.resolve(process.argv[2] ?? "packages/webui/src")
const output = path.resolve(process.argv[3] ?? ".tasks/ui-pattern-inventory.json")

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(absolute)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : []
  }))
  return nested.flat()
}

const files = (await sourceFiles(root)).sort()
const findings = []
for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join("/")
  findings.push(...analyzeUiSourcePatterns({ path: relative, source: await readFile(file, "utf8") }))
}
const counts = findings.reduce((result, item) => {
  result[item.kind] = (result[item.kind] ?? 0) + 1
  return result
}, {})
await writeFile(output, `${JSON.stringify({ version: "ui-pattern-inventory:v1", sourceRoot: "packages/webui/src", fileCount: files.length, counts, findings }, null, 2)}\n`)
