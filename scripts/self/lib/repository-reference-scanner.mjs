import { existsSync, readFileSync } from "node:fs"
import { join, posix, relative } from "node:path"
import ts from "typescript"

const TYPESCRIPT_SOURCE = /\.(?:ts|tsx|mts|cts)$/u
const isTypeScriptSource = (artifactId) =>
  TYPESCRIPT_SOURCE.test(artifactId) && !artifactId.endsWith(".d.ts")

function boundaryFor(owner) {
  if (owner.startsWith("tests/")) return "test"
  if (/(?:^|\/)(?:migrations?|migration-[^/]+)\.ts$/u.test(owner)) return "migration"
  return "runtime"
}

function moduleCandidates(owner, specifier) {
  const pathSpecifier = specifier.replace(/[?#].*$/u, "")
  const unresolved = posix.normalize(posix.join(posix.dirname(owner), pathSpecifier))
  const base = unresolved.replace(/\.(?:js|jsx|mjs|cjs)$/u, "")
  return [
    unresolved,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]
}

export function scanTypeScriptReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []

  for (const owner of [...artifactIds].filter(isTypeScriptSource).sort()) {
    let content
    try {
      content = readFileSync(join(input.repositoryRoot, owner), "utf8")
    } catch {
      diagnostics.push({ code: "source_unreadable", owner, specifier: "" })
      continue
    }

    const parsed = ts.preProcessFile(content, true, true)
    const specifiers = new Set(
      [...parsed.importedFiles, ...parsed.referencedFiles, ...parsed.typeReferenceDirectives].map(
        (reference) => reference.fileName,
      ),
    )
    for (const specifier of [...specifiers].sort()) {
      if (!specifier.startsWith(".")) continue
      const candidates = moduleCandidates(owner, specifier)
      if (candidates[0]?.split("/").includes("node_modules")) continue
      const targetArtifactId = candidates.find((candidate) => artifactIds.has(candidate))
      if (!targetArtifactId) {
        diagnostics.push({ code: "module_unresolved", owner, specifier })
        continue
      }
      const record = {
        boundary: boundaryFor(owner),
        targetArtifactId,
        owner,
        detail: `module:${specifier}`,
      }
      records.set(
        [record.boundary, record.targetArtifactId, record.owner, record.detail].join("\u0000"),
        record,
      )
    }
  }

  const sortedDiagnostics = diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.specifier.localeCompare(right.specifier),
  )
  return {
    complete: sortedDiagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.boundary.localeCompare(right.boundary) ||
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner) ||
        left.detail.localeCompare(right.detail),
    ),
    diagnostics: sortedDiagnostics,
  }
}

function manifestPath(owner, reference) {
  return posix.normalize(
    posix.join(posix.dirname(owner), reference.replace(/^\.\//u, "").replace(/[?#].*$/u, "")),
  )
}

function commandPathTokens(command) {
  const tokens = command.split(/\s+/u).map((token) => token.replace(/^["'`(]+|["'`),;]+$/gu, ""))
  const references = []
  let skipGeneratedTarget = false
  for (const token of tokens) {
    if (skipGeneratedTarget) {
      skipGeneratedTarget = false
      continue
    }
    if (["--output", "--out", "-o", ">", ">>"].includes(token)) {
      skipGeneratedTarget = true
      continue
    }
    if (/^--(?:output|out)=/u.test(token)) continue
    if (token === ".tasks" || token.startsWith(".tasks/")) continue
    if (/(?:^|\/)[A-Za-z0-9_.-]+\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|sh|bat|ps1|md)$/u.test(token)) {
      references.push(token)
    }
  }
  return references
}

function sourceEntrypointCandidates(owner, reference) {
  const packageRelative = reference
    .replace(/^\.\//u, "")
    .replace(/^dist\//u, "src/")
    .replace(/\.d\.ts$/u, "")
    .replace(/\.(?:js|jsx|mjs|cjs)$/u, "")
  const base = manifestPath(owner, packageRelative)
  return [`${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`]
}

export function scanPackageManifestReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []
  const addRecord = (record) => {
    records.set(
      [record.boundary, record.targetArtifactId, record.owner, record.detail].join("\u0000"),
      record,
    )
  }
  const unresolved = (owner, reference) => {
    diagnostics.push({ code: "manifest_reference_unresolved", owner, reference })
  }

  for (const owner of [...artifactIds].filter((id) => id.endsWith("package.json")).sort()) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(input.repositoryRoot, owner), "utf8"))
    } catch {
      diagnostics.push({ code: "manifest_unreadable", owner, reference: "" })
      continue
    }

    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (typeof command !== "string") continue
      const pathTokens = commandPathTokens(command)
      for (const reference of pathTokens) {
        const targetArtifactId = manifestPath(owner, reference)
        if (artifactIds.has(targetArtifactId)) {
          addRecord({ boundary: "build", targetArtifactId, owner, detail: `script:${name}` })
        } else if (
          !targetArtifactId.split("/").includes("dist") &&
          !targetArtifactId.split("/").includes("node_modules")
        ) {
          unresolved(owner, reference)
        }
      }
      if (
        /(?:^|\s)vitest(?:\s|$)/u.test(command) &&
        !pathTokens.some((reference) => reference.startsWith("tests/"))
      ) {
        for (const targetArtifactId of [...artifactIds]
          .filter((artifactId) =>
            /^tests\/.+\.(?:test|spec)\.(?:ts|tsx|js|jsx|mts|cts)$/u.test(artifactId),
          )
          .sort()) {
          addRecord({ boundary: "build", targetArtifactId, owner, detail: `test-suite:${name}` })
        }
      }
    }
    if (
      Object.values(manifest.scripts ?? {}).some(
        (command) => typeof command === "string" && /(?:^|\s)vite\s+build(?:\s|$)/u.test(command),
      )
    ) {
      const targetArtifactId = manifestPath(owner, "index.html")
      if (artifactIds.has(targetArtifactId)) {
        addRecord({ boundary: "build", targetArtifactId, owner, detail: "tool:vite-entry" })
      } else {
        unresolved(owner, "index.html")
      }
    }

    const binEntries =
      typeof manifest.bin === "string"
        ? [[manifest.name ?? "default", manifest.bin]]
        : Object.entries(manifest.bin ?? {})
    for (const [name, reference] of binEntries) {
      if (typeof reference !== "string") continue
      const targetArtifactId = manifestPath(owner, reference)
      if (artifactIds.has(targetArtifactId)) {
        addRecord({ boundary: "deployment", targetArtifactId, owner, detail: `bin:${name}` })
      } else if (!targetArtifactId.split("/").includes("dist")) {
        unresolved(owner, reference)
      }
    }

    for (const reference of Array.isArray(manifest.files) ? manifest.files : []) {
      if (typeof reference !== "string" || /[*{}[\]]/u.test(reference)) continue
      const target = manifestPath(owner, reference).replace(/\/$/u, "")
      const matches = [...artifactIds]
        .filter((artifactId) => artifactId === target || artifactId.startsWith(`${target}/`))
        .sort()
      for (const targetArtifactId of matches) {
        addRecord({ boundary: "deployment", targetArtifactId, owner, detail: `files:${reference}` })
      }
      if (matches.length === 0 && !target.split("/").includes("dist")) unresolved(owner, reference)
    }

    for (const [field, reference] of [
      ["main", manifest.main],
      ["types", manifest.types],
    ]) {
      if (typeof reference !== "string") continue
      const targetArtifactId = manifestPath(owner, reference)
      if (artifactIds.has(targetArtifactId)) {
        addRecord({ boundary: "deployment", targetArtifactId, owner, detail: field })
      } else if (targetArtifactId.split("/").includes("dist")) {
        const sourceEntrypoint = sourceEntrypointCandidates(owner, reference).find((candidate) =>
          artifactIds.has(candidate),
        )
        if (sourceEntrypoint) {
          addRecord({
            boundary: "deployment",
            targetArtifactId: sourceEntrypoint,
            owner,
            detail: `entrypoint:${field}`,
          })
        }
      } else {
        unresolved(owner, reference)
      }
    }
  }

  const sortedDiagnostics = diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  return {
    complete: sortedDiagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.boundary.localeCompare(right.boundary) ||
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner) ||
        left.detail.localeCompare(right.detail),
    ),
    diagnostics: sortedDiagnostics,
  }
}

export function scanPromptRegistryReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = []
  const diagnostics = []
  const registeredPaths = new Set()

  for (const definition of [...input.definitions].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  )) {
    const owner = `prompt-registry:${definition.sourceId}`
    for (const locale of ["en", "ko"]) {
      const filename = definition.filenames?.[locale]
      if (typeof filename !== "string" || !filename.trim()) {
        diagnostics.push({ code: "prompt_definition_invalid", owner, reference: locale })
        continue
      }
      const targetArtifactId = `prompts/${filename}`
      registeredPaths.add(targetArtifactId)
      if (artifactIds.has(targetArtifactId)) {
        records.push({
          boundary: "registry",
          targetArtifactId,
          owner,
          detail: `locale:${locale}`,
        })
      } else if (locale === "en") {
        diagnostics.push({ code: "prompt_source_missing", owner, reference: targetArtifactId })
      }
    }
  }

  for (const artifactId of [...artifactIds]
    .filter((id) => id.startsWith("prompts/") && id.endsWith(".md"))
    .sort()) {
    if (!registeredPaths.has(artifactId)) {
      diagnostics.push({
        code: "prompt_source_unregistered",
        owner: "prompt-registry",
        reference: artifactId,
      })
    }
  }

  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  records.sort(
    (left, right) =>
      left.targetArtifactId.localeCompare(right.targetArtifactId) ||
      left.owner.localeCompare(right.owner) ||
      left.detail.localeCompare(right.detail),
  )
  return { complete: diagnostics.length === 0, records, diagnostics }
}

export function scanTsConfigReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []
  const configIds = [...artifactIds]
    .filter((id) => /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/u.test(id))
    .sort()

  const addRecord = (record) =>
    records.set(
      [record.boundary, record.targetArtifactId, record.owner, record.detail].join("\u0000"),
      record,
    )

  for (const owner of configIds) {
    const absoluteConfig = join(input.repositoryRoot, owner)
    const read = ts.readConfigFile(absoluteConfig, ts.sys.readFile)
    if (read.error) {
      diagnostics.push({ code: "tsconfig_invalid", owner, reference: "" })
      continue
    }

    const extended =
      typeof read.config.extends === "string"
        ? [read.config.extends]
        : Array.isArray(read.config.extends)
          ? read.config.extends
          : []
    for (const reference of extended) {
      if (typeof reference !== "string" || !reference.startsWith(".")) continue
      let targetArtifactId = posix.normalize(posix.join(posix.dirname(owner), reference))
      if (!targetArtifactId.endsWith(".json")) targetArtifactId += ".json"
      if (artifactIds.has(targetArtifactId)) {
        addRecord({ boundary: "build", targetArtifactId, owner, detail: "tsconfig:extends" })
      } else {
        diagnostics.push({ code: "tsconfig_reference_unresolved", owner, reference })
      }
    }

    if (
      !Array.isArray(read.config.include) &&
      !Array.isArray(read.config.files) &&
      !Array.isArray(read.config.references)
    ) {
      continue
    }
    const parsed = ts.parseJsonConfigFileContent(
      read.config,
      ts.sys,
      join(input.repositoryRoot, posix.dirname(owner)),
      undefined,
      absoluteConfig,
    )
    if (parsed.errors.length > 0) {
      diagnostics.push({ code: "tsconfig_invalid", owner, reference: "" })
      continue
    }
    for (const filename of parsed.fileNames) {
      const targetArtifactId = relative(input.repositoryRoot, filename).replaceAll("\\", "/")
      if (!artifactIds.has(targetArtifactId)) {
        diagnostics.push({
          code: "tsconfig_reference_unresolved",
          owner,
          reference: targetArtifactId,
        })
        continue
      }
      addRecord({ boundary: "build", targetArtifactId, owner, detail: "tsconfig:file" })
    }
  }

  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner) ||
        left.detail.localeCompare(right.detail),
    ),
    diagnostics,
  }
}

function fileCallName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return ""
}

function literalFileReference(argument) {
  if (!argument) return null
  if (ts.isStringLiteralLike(argument)) return argument.text
  if (
    ts.isNewExpression(argument) &&
    ts.isIdentifier(argument.expression) &&
    argument.expression.text === "URL" &&
    ts.isStringLiteralLike(argument.arguments?.[0])
  ) {
    return argument.arguments[0].text
  }
  return null
}

function governedLiteral(reference) {
  return /^(?:\.\.\/|\.\/|AGENTS\.md$|README(?:\.[^.]+)?\.md$|(?:docs|packages|prompts|scripts|tests)\/)/u.test(
    reference,
  )
}

export function scanFilesystemLiteralReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []

  for (const owner of [...artifactIds].filter(isTypeScriptSource).sort()) {
    let content
    try {
      content = readFileSync(join(input.repositoryRoot, owner), "utf8")
    } catch {
      diagnostics.push({ code: "filesystem_source_unreadable", owner, reference: "" })
      continue
    }
    const source = ts.createSourceFile(
      owner,
      content,
      ts.ScriptTarget.Latest,
      false,
      owner.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const name = fileCallName(node.expression)
        if (name === "readFile" || name === "readFileSync") {
          const reference = literalFileReference(node.arguments[0])
          if (reference && governedLiteral(reference)) {
            const targetArtifactId = reference.startsWith(".")
              ? posix.normalize(posix.join(posix.dirname(owner), reference))
              : reference.replace(/^\.\//u, "")
            if (artifactIds.has(targetArtifactId)) {
              const record = {
                boundary: boundaryFor(owner),
                targetArtifactId,
                owner,
                detail: `filesystem:${name}`,
              }
              records.set(
                [record.boundary, record.targetArtifactId, record.owner, record.detail].join(
                  "\u0000",
                ),
                record,
              )
            } else if (!existsSync(join(input.repositoryRoot, targetArtifactId))) {
              diagnostics.push({ code: "filesystem_reference_unresolved", owner, reference })
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.boundary.localeCompare(right.boundary) ||
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner) ||
        left.detail.localeCompare(right.detail),
    ),
    diagnostics,
  }
}

export function scanMarkdownReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []

  for (const owner of [...artifactIds].filter((id) => id.endsWith(".md")).sort()) {
    let content
    try {
      content = readFileSync(join(input.repositoryRoot, owner), "utf8")
    } catch {
      diagnostics.push({ code: "markdown_source_unreadable", owner, reference: "" })
      continue
    }
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu)) {
      const reference = (match[1] ?? "").replace(/^<|>$/gu, "")
      if (!reference || reference.startsWith("#") || /^(?:https?:|mailto:|data:)/u.test(reference))
        continue
      const pathReference = reference.replace(/[?#].*$/u, "")
      if (!/\.[A-Za-z0-9]+$/u.test(pathReference)) continue
      const targetArtifactId = pathReference.startsWith("/")
        ? pathReference.slice(1)
        : posix.normalize(posix.join(posix.dirname(owner), pathReference))
      if (artifactIds.has(targetArtifactId)) {
        const record = {
          boundary: "build",
          targetArtifactId,
          owner,
          detail: "markdown:link",
        }
        records.set(`${targetArtifactId}\u0000${owner}`, record)
      } else {
        diagnostics.push({ code: "markdown_reference_unresolved", owner, reference })
      }
    }
    for (const match of content.matchAll(
      /(?:^|[\s`"'(])((?:docs|packages|prompts|scripts|tests)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?=$|[\s`"'),;])/gmu,
    )) {
      const targetArtifactId = match[1]?.replace(/[.,;:]$/u, "")
      if (!targetArtifactId || !artifactIds.has(targetArtifactId)) continue
      const record = {
        boundary: "build",
        targetArtifactId,
        owner,
        detail: "markdown:repository-path",
      }
      records.set(`${targetArtifactId}\u0000${owner}`, record)
    }
  }

  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner),
    ),
    diagnostics,
  }
}

export function scanShellReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []
  const shellOwners = [...artifactIds]
    .filter((id) => id.startsWith("scripts/") && /\.(?:sh|bat|ps1)$/u.test(id))
    .sort()

  for (const owner of shellOwners) {
    let content
    try {
      content = readFileSync(join(input.repositoryRoot, owner), "utf8")
    } catch {
      diagnostics.push({ code: "shell_source_unreadable", owner, reference: "" })
      continue
    }
    const references = new Set()
    for (const match of content.matchAll(/\bscripts\/([A-Za-z0-9_.-]+\.(?:sh|bat|ps1|mjs))\b/gu)) {
      references.add(`scripts/${match[1]}`)
    }
    for (const match of content.matchAll(
      /(?:%SCRIPT_DIR%|\$\{?SCRIPT_DIR\}?\/?)([A-Za-z0-9_.-]+\.(?:sh|bat|ps1|mjs))\b/gu,
    )) {
      references.add(`scripts/${match[1]}`)
    }
    for (const targetArtifactId of [...references].sort()) {
      if (targetArtifactId === owner) continue
      if (artifactIds.has(targetArtifactId)) {
        const record = {
          boundary: "deployment",
          targetArtifactId,
          owner,
          detail: "shell:script-reference",
        }
        records.set(`${targetArtifactId}\u0000${owner}`, record)
      } else {
        diagnostics.push({ code: "shell_reference_unresolved", owner, reference: targetArtifactId })
      }
    }
  }

  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner),
    ),
    diagnostics,
  }
}

function packageRootFor(owner, artifactIds) {
  let current = posix.dirname(owner)
  while (current && current !== ".") {
    if (artifactIds.has(`${current}/package.json`)) return current
    const parent = posix.dirname(current)
    if (parent === current) break
    current = parent
  }
  return ""
}

export function scanHtmlReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []

  for (const { owner, content } of [...input.documents].sort((left, right) =>
    left.owner.localeCompare(right.owner),
  )) {
    const packageRoot = packageRootFor(owner, artifactIds)
    for (const match of content.matchAll(/\b(src|href)=["']([^"']+)["']/gu)) {
      const attribute = match[1]
      const reference = match[2] ?? ""
      if (!attribute || !reference || /^(?:https?:|\/\/|data:|#)/u.test(reference)) continue
      const pathReference = reference.replace(/[?#].*$/u, "")
      const candidates = pathReference.startsWith("/")
        ? [
            posix.join(packageRoot, pathReference.slice(1)),
            posix.join(packageRoot, "public", pathReference.slice(1)),
          ]
        : [posix.normalize(posix.join(posix.dirname(owner), pathReference))]
      const targetArtifactId = candidates.find((candidate) => artifactIds.has(candidate))
      if (targetArtifactId) {
        const record = {
          boundary: "build",
          targetArtifactId,
          owner,
          detail: `html:${attribute}`,
        }
        records.set(`${targetArtifactId}\u0000${owner}\u0000${attribute}`, record)
      } else {
        diagnostics.push({ code: "html_reference_unresolved", owner, reference })
      }
    }
  }

  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner) ||
        left.detail.localeCompare(right.detail),
    ),
    diagnostics,
  }
}

export function scanExactRepositoryLiteralReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const referenceTargets = new Set(
    input.artifactIds.filter(
      (artifactId) =>
        !(
          artifactId.startsWith("packages/core/src/") &&
          /(?:\.d\.ts|\.d\.ts\.map|\.js|\.js\.map)$/u.test(artifactId)
        ),
    ),
  )
  const records = new Map()
  const diagnostics = []

  for (const owner of [...artifactIds].filter(isTypeScriptSource).sort()) {
    let content
    try {
      content = readFileSync(join(input.repositoryRoot, owner), "utf8")
    } catch {
      diagnostics.push({ code: "literal_source_unreadable", owner, reference: "" })
      continue
    }
    const source = ts.createSourceFile(
      owner,
      content,
      ts.ScriptTarget.Latest,
      false,
      owner.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const targets = new Set()
    const consider = (value) => {
      const normalized = value.replace(/[?#].*$/u, "").replaceAll("\\", "/")
      const candidates = [normalized, posix.normalize(posix.join(posix.dirname(owner), normalized))]
      for (const candidate of candidates) {
        if (candidate !== owner && referenceTargets.has(candidate)) targets.add(candidate)
      }
    }
    const visit = (node) => {
      if (ts.isStringLiteralLike(node)) consider(node.text)
      if (ts.isCallExpression(node) && fileCallName(node.expression) === "join") {
        const segments = node.arguments
          .filter((argument) => ts.isStringLiteralLike(argument))
          .map((argument) => argument.text)
        if (segments.length > 0) consider(posix.join(...segments))
      }
      ts.forEachChild(node, visit)
    }
    visit(source)

    for (const targetArtifactId of [...targets].sort()) {
      const record = {
        boundary: boundaryFor(owner),
        targetArtifactId,
        owner,
        detail: "literal:repository-path",
      }
      records.set(`${record.boundary}\u0000${targetArtifactId}\u0000${owner}`, record)
    }
  }

  diagnostics.sort((left, right) => left.owner.localeCompare(right.owner))
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.boundary.localeCompare(right.boundary) ||
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner),
    ),
    diagnostics,
  }
}

function workspacePatterns(content) {
  const patterns = []
  let inPackages = false
  for (const line of content.split(/\r?\n/u)) {
    if (/^packages:\s*$/u.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages && /^\S/u.test(line)) break
    const match = inPackages ? line.match(/^\s*-\s*["']?([^"'#]+?)["']?\s*$/u) : null
    if (match?.[1]) patterns.push(match[1].trim().replace(/\/$/u, ""))
  }
  return patterns
}

function workspacePatternMatches(pattern, artifactIds) {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1)
    return [...artifactIds].filter(
      (artifactId) =>
        artifactId.startsWith(prefix) &&
        /^[^/]+\/package\.json$/u.test(artifactId.slice(prefix.length)),
    )
  }
  const manifest = `${pattern}/package.json`
  return artifactIds.has(manifest) ? [manifest] : []
}

export function scanWorkspaceOwnershipReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const records = new Map()
  const diagnostics = []
  const addRecord = (targetArtifactId, owner, detail) => {
    if (!artifactIds.has(targetArtifactId)) return
    const record = { boundary: "build", targetArtifactId, owner, detail }
    records.set(`${targetArtifactId}\u0000${owner}\u0000${detail}`, record)
  }

  if (!artifactIds.has("package.json")) {
    diagnostics.push({
      code: "workspace_root_manifest_missing",
      owner: "workspace:repository",
      reference: "package.json",
    })
  } else {
    addRecord("package.json", "workspace:repository", "workspace:root-manifest")
  }

  let rootManifest = {}
  if (artifactIds.has("package.json")) {
    try {
      rootManifest = JSON.parse(readFileSync(join(input.repositoryRoot, "package.json"), "utf8"))
    } catch {
      diagnostics.push({
        code: "workspace_root_manifest_invalid",
        owner: "workspace:repository",
        reference: "package.json",
      })
    }
  }

  if (artifactIds.has("pnpm-workspace.yaml")) {
    addRecord("pnpm-workspace.yaml", "package.json", "workspace:definition")
    let patterns = []
    try {
      patterns = workspacePatterns(
        readFileSync(join(input.repositoryRoot, "pnpm-workspace.yaml"), "utf8"),
      )
    } catch {
      diagnostics.push({
        code: "workspace_definition_unreadable",
        owner: "pnpm-workspace.yaml",
        reference: "",
      })
    }
    for (const pattern of patterns) {
      const matches = workspacePatternMatches(pattern, artifactIds).sort()
      if (matches.length === 0) {
        diagnostics.push({
          code: "workspace_pattern_unresolved",
          owner: "pnpm-workspace.yaml",
          reference: pattern,
        })
      }
      for (const targetArtifactId of matches) {
        addRecord(targetArtifactId, "pnpm-workspace.yaml", "workspace:member-manifest")
      }
    }
  }

  if (
    typeof rootManifest.packageManager === "string" &&
    rootManifest.packageManager.startsWith("pnpm@")
  ) {
    addRecord("pnpm-lock.yaml", "package.json", "workspace:package-manager-lock")
  }
  for (const targetArtifactId of ["biome.json", "tsconfig.json", "tsconfig.base.json"]) {
    addRecord(targetArtifactId, "package.json", "workspace:root-config")
  }

  const packageConfig =
    /(?:^|\/)(?:tsconfig(?:\.[^/]+)?\.json|vite\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|postcss\.config\.[cm]?js|tailwind\.config\.[cm]?[jt]s)$/u
  for (const targetArtifactId of [...artifactIds].filter((id) => packageConfig.test(id)).sort()) {
    const packageRoot = packageRootFor(targetArtifactId, artifactIds)
    if (packageRoot) {
      addRecord(targetArtifactId, `${packageRoot}/package.json`, "workspace:package-config")
    }
  }

  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) || left.reference.localeCompare(right.reference),
  )
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner) ||
        left.detail.localeCompare(right.detail),
    ),
    diagnostics,
  }
}

export function scanDirectoryDiscoveryReferences(input) {
  const artifactIds = new Set(input.artifactIds)
  const discoveryTargets = new Set(
    input.artifactIds.filter(
      (artifactId) =>
        !(
          artifactId.startsWith("packages/core/src/") &&
          /(?:\.d\.ts|\.d\.ts\.map|\.js|\.js\.map)$/u.test(artifactId)
        ),
    ),
  )
  const records = new Map()
  const diagnostics = []

  for (const owner of [...artifactIds].filter(isTypeScriptSource).sort()) {
    let content
    try {
      content = readFileSync(join(input.repositoryRoot, owner), "utf8")
    } catch {
      diagnostics.push({ code: "discovery_source_unreadable", owner, reference: "" })
      continue
    }
    if (
      !/(?:readdirSync|load[A-Za-z0-9_]*(?:FromDir|Directory)|collectSourceDocs)\s*\(/u.test(
        content,
      )
    )
      continue

    const source = ts.createSourceFile(
      owner,
      content,
      ts.ScriptTarget.Latest,
      false,
      owner.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const directoryCandidates = new Set()
    const basenameFilters = new Set()
    const visit = (node) => {
      if (ts.isCallExpression(node) && fileCallName(node.expression) === "join") {
        const segments = node.arguments
          .filter((argument) => ts.isStringLiteralLike(argument))
          .map((argument) => argument.text)
        if (segments.length >= 2 || (segments.length === 1 && segments[0]?.includes("/"))) {
          const candidate = posix.join(...segments).replace(/^\.\//u, "")
          directoryCandidates.add(candidate)
          directoryCandidates.add(posix.normalize(posix.join(posix.dirname(owner), candidate)))
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)
      ) {
        const leftIdentifier = ts.isIdentifier(node.left) ? node.left.text : ""
        const rightIdentifier = ts.isIdentifier(node.right) ? node.right.text : ""
        const literal =
          ts.isStringLiteralLike(node.left) &&
          /^(?:entry|file|filename|name)$/iu.test(rightIdentifier)
            ? node.left
            : ts.isStringLiteralLike(node.right) &&
                /^(?:entry|file|filename|name)$/iu.test(leftIdentifier)
              ? node.right
              : null
        if (literal && /^[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$/u.test(literal.text)) {
          basenameFilters.add(literal.text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)

    for (const directory of [...directoryCandidates].sort()) {
      const prefix = `${directory.replace(/\/$/u, "")}/`
      if (basenameFilters.size === 0 && !/(?:^|\/)tests\/fixtures(?:\/|$)/u.test(directory))
        continue
      const targets = [...discoveryTargets].filter(
        (artifactId) =>
          artifactId.startsWith(prefix) &&
          (basenameFilters.size === 0 || basenameFilters.has(posix.basename(artifactId))),
      )
      for (const targetArtifactId of targets.sort()) {
        if (targetArtifactId === owner) continue
        const record = {
          boundary: boundaryFor(owner),
          targetArtifactId,
          owner,
          detail: "directory:discovery",
        }
        records.set(`${record.boundary}\u0000${targetArtifactId}\u0000${owner}`, record)
      }
    }
  }

  diagnostics.sort((left, right) => left.owner.localeCompare(right.owner))
  return {
    complete: diagnostics.length === 0,
    records: [...records.values()].sort(
      (left, right) =>
        left.boundary.localeCompare(right.boundary) ||
        left.targetArtifactId.localeCompare(right.targetArtifactId) ||
        left.owner.localeCompare(right.owner),
    ),
    diagnostics,
  }
}
