#!/usr/bin/env node
import { createHash } from "node:crypto"
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const entryPoint = "packages/cli/dist/serve-entry.js"
const artifact = "packages/core/dist/runtime/serve-bundle.js"
const sourceMap = `${artifact}.map`
const declaration = artifact.replace(/\.js$/u, ".d.ts")
const metafilePath = "packages/core/dist/runtime/serve-bundle.meta.json"
const manifestPath = "packages/core/dist/runtime/serve-bundle.manifest.json"
const artifactDirectory = dirname(resolve(rootDir, artifact))
const entryPointPath = resolve(rootDir, entryPoint)
const preservedImportMetaUrlInputs = new Set()

const CORE_EXPORTS = new Map([
  ["@knowbee/core", "packages/core/dist/index.js"],
  ["@knowbee/core/bootstrap", "packages/core/dist/runtime/bootstrap.js"],
  ["@knowbee/core/errors", "packages/core/dist/runs/error-sanitizer.js"],
  ["@knowbee/core/startup", "packages/core/dist/runtime/startup.js"],
])

function repositoryPath(path) {
  const normalized = relative(rootDir, resolve(rootDir, path)).split(sep).join("/")
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("gateway_bundle_path_outside_repository")
  }
  return normalized
}

function stableMetafile(metafile) {
  const stableEntries = (record) =>
    Object.fromEntries(
      Object.entries(record)
        .map(([path, value]) => [repositoryPath(path), value])
        .sort(([left], [right]) => left.localeCompare(right)),
    )
  return {
    inputs: stableEntries(metafile.inputs),
    outputs: stableEntries(metafile.outputs),
  }
}

function packageName(path) {
  if (
    path.startsWith("node:") ||
    path.startsWith(".") ||
    path.startsWith("/") ||
    path.startsWith("file:")
  ) {
    return null
  }
  const parts = path.split("/")
  return path.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? null
}

const workspaceCoreResolver = {
  name: "workspace-core-resolver",
  setup(buildContext) {
    buildContext.onResolve({ filter: /^@knowbee\/core(?:\/.*)?$/ }, (args) => {
      const target = CORE_EXPORTS.get(args.path)
      if (!target) {
        return {
          errors: [{ text: `Unsupported Core startup export: ${args.path}` }],
        }
      }
      return { path: resolve(rootDir, target) }
    })
  },
}

const preserveModuleUrlResolver = {
  name: "preserve-module-url",
  setup(buildContext) {
    buildContext.onLoad({ filter: /\.js$/ }, (args) => {
      if (
        !args.path.startsWith(`${rootDir}${sep}`) ||
        args.path === entryPointPath
      ) {
        return null
      }
      const contents = readFileSync(args.path, "utf8")
      if (!contents.includes("import.meta.url")) return null
      const originalModulePath = relative(artifactDirectory, args.path)
        .split(sep)
        .join("/")
      preservedImportMetaUrlInputs.add(repositoryPath(args.path))
      return {
        contents: contents.replaceAll(
          "import.meta.url",
          `new URL(${JSON.stringify(originalModulePath)}, import.meta.url).href`,
        ),
        loader: "js",
      }
    })
  },
}

mkdirSync(resolve(rootDir, dirname(artifact)), { recursive: true })
const result = await build({
  absWorkingDir: rootDir,
  entryPoints: [entryPoint],
  outfile: artifact,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  plugins: [workspaceCoreResolver, preserveModuleUrlResolver],
  sourcemap: "external",
  sourcesContent: false,
  metafile: true,
  legalComments: "none",
  charset: "utf8",
  splitting: false,
  logLevel: "warning",
})

const stableMeta = stableMetafile(result.metafile)
writeFileSync(
  resolve(rootDir, metafilePath),
  `${JSON.stringify(stableMeta, null, 2)}\n`,
  "utf8",
)

const bundleBytes = statSync(resolve(rootDir, artifact)).size
const bundleSha256 = createHash("sha256")
  .update(readFileSync(resolve(rootDir, artifact)))
  .digest("hex")
const externalPackages = [
  ...new Set(
    Object.values(result.metafile.outputs)
      .flatMap((output) => output.imports)
      .filter((item) => item.external)
      .map((item) => packageName(item.path))
      .filter((value) => value !== null),
  ),
].sort()
const bundledInputs = Object.keys(result.metafile.inputs)
  .map(repositoryPath)
  .sort()
function sha256FileSet(paths) {
  const hash = createHash("sha256")
  for (const path of [...paths].sort()) {
    hash.update(path)
    hash.update("\0")
    hash.update(readFileSync(resolve(rootDir, path)))
    hash.update("\0")
  }
  return hash.digest("hex")
}
const entryPointSha256 = createHash("sha256")
  .update(readFileSync(resolve(rootDir, entryPoint)))
  .digest("hex")
const bundledInputsSha256 = sha256FileSet(bundledInputs)
const manifest = {
  schemaVersion: 2,
  entryPoint,
  entryPointSha256,
  artifact,
  sourceMap,
  declaration,
  metafile: metafilePath,
  repositoryOwnedJavaScriptFiles: [artifact],
  repositoryOwnedJavaScriptFileCount: 1,
  bundleBytes,
  bundleSha256,
  bundledInputsSha256,
  externalPackages,
  bundledInputs,
  preservedImportMetaUrlInputs: [...preservedImportMetaUrlInputs].sort(),
}

writeFileSync(
  resolve(rootDir, manifestPath),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
)
writeFileSync(
  resolve(rootDir, declaration),
  [
    "export declare function runServeEntry(): Promise<void>",
    "export declare function serveCommand(): Promise<void>",
    "",
  ].join("\n"),
  "utf8",
)
console.log(
  `Gateway startup bundle: ${artifact} (${bundleBytes} bytes, ${bundledInputs.length} inputs)`,
)
