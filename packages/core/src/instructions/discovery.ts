import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, normalize, relative, resolve } from "node:path"
import { redactLogText } from "../logger/index.js"

const MAX_INSTRUCTION_FILE_SIZE = 12_000
const FALLBACK_FILENAMES = ["CLAUDE.md"] as const
const PER_DIR_CANDIDATES = ["AGENTS.override.md", "AGENTS.md", ...FALLBACK_FILENAMES] as const

function instructionDiscoveryErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export interface InstructionSource {
  path: string
  scope: "global" | "project"
  level: number
  exists: boolean
  loaded: boolean
  size: number
  mtimeMs?: number
  content?: string
  error?: string
  sourceKind?: "instruction_file" | "agent_prompt"
  agentId?: string
  agentType?: "knowbee" | "sub_agent"
  sourceId?: string
}

export interface InstructionChain {
  workDir: string
  gitRoot?: string
  sources: InstructionSource[]
}

export interface AgentInstructionSourceInput {
  agentId: string
  agentType: "knowbee" | "sub_agent"
  sourceId: string
  content: string
  version?: string
}

export interface InstructionDiscoveryInput {
  workDir: string
  globalStateDir: string
  fallbackBoundaryDir: string
  agentSources?: AgentInstructionSourceInput[]
}

export function discoverInstructionChain(input: InstructionDiscoveryInput): InstructionChain {
  const normalizedWorkDir = resolve(input.workDir)
  const gitRoot = findGitRoot(normalizedWorkDir)
  const sources: InstructionSource[] = []

  const globalSource = pickInstructionFile(resolve(input.globalStateDir), "global", 0)
  if (globalSource) sources.push(globalSource)

  const dirs = gitRoot
    ? buildPathChain(gitRoot, normalizedWorkDir)
    : buildFallbackPathChain(normalizedWorkDir, input.fallbackBoundaryDir)

  dirs.forEach((dirPath, index) => {
    const source = pickInstructionFile(dirPath, "project", index + 1)
    if (source) sources.push(source)
  })

  sources.push(...normalizeAgentSources(input.agentSources ?? [], sources.length + 1))

  return {
    workDir: normalizedWorkDir,
    ...(gitRoot ? { gitRoot } : {}),
    sources,
  }
}

function pickInstructionFile(dirPath: string, scope: "global" | "project", level: number): InstructionSource | undefined {
  for (const filename of PER_DIR_CANDIDATES) {
    const candidate = join(dirPath, filename)
    if (!existsSync(candidate)) continue

    try {
      const stat = statSync(candidate)
      if (!stat.isFile()) continue
      const content = readFileSync(candidate, "utf-8").slice(0, MAX_INSTRUCTION_FILE_SIZE)
      return {
        path: candidate,
        scope,
        level,
        exists: true,
        loaded: true,
        size: Buffer.byteLength(content),
        mtimeMs: stat.mtimeMs,
        content,
        sourceKind: "instruction_file",
      }
    } catch (error) {
      const message = instructionDiscoveryErrorMessage(error)
      return {
        path: candidate,
        scope,
        level,
        exists: true,
        loaded: false,
        size: 0,
        error: message,
        sourceKind: "instruction_file",
      }
    }
  }

  return undefined
}

function normalizeAgentSources(agentSources: AgentInstructionSourceInput[], startLevel: number): InstructionSource[] {
  return agentSources
    .map((source, index): InstructionSource => {
      const content = source.content.slice(0, MAX_INSTRUCTION_FILE_SIZE)
      return {
        path: `agent://${source.agentType}/${source.agentId}/${source.sourceId}`,
        scope: "project",
        level: startLevel + index,
        exists: true,
        loaded: Boolean(content.trim()),
        size: Buffer.byteLength(content),
        content,
        sourceKind: "agent_prompt",
        agentId: source.agentId,
        agentType: source.agentType,
        sourceId: source.sourceId,
      }
    })
    .filter((source) => source.loaded)
}

function findGitRoot(startDir: string): string | undefined {
  let current = startDir
  while (true) {
    if (existsSync(join(current, ".git"))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function buildPathChain(rootDir: string, targetDir: string): string[] {
  const normalizedRoot = normalize(resolve(rootDir))
  const normalizedTarget = normalize(resolve(targetDir))
  const relativePath = relative(normalizedRoot, normalizedTarget)
  if (relativePath.startsWith("..") || relativePath === "") {
    if (relativePath === "") return [normalizedRoot]
    return [normalizedTarget]
  }

  const chain = [normalizedRoot]
  let current = normalizedRoot
  const relativeParts = relativePath.split("/").filter(Boolean)
  for (const part of relativeParts) {
    current = join(current, part)
    chain.push(current)
  }

  return chain
}

function buildFallbackPathChain(targetDir: string, boundaryDir: string): string[] {
  const normalizedTarget = normalize(resolve(targetDir))
  const normalizedBoundary = normalize(resolve(boundaryDir))
  const withinBoundary = isInside(normalizedBoundary, normalizedTarget)
  const chain = [normalizedTarget]
  let current = normalizedTarget
  let depth = 0

  while (depth < 8) {
    const parent = dirname(current)
    if (parent === current) break
    if (withinBoundary && parent === normalizedBoundary) break
    chain.push(parent)
    current = parent
    depth += 1
  }

  return [...new Set(chain.reverse())]
}

function isInside(parentDir: string, childDir: string): boolean {
  const relativePath = relative(parentDir, childDir)
  return relativePath === "" || (!relativePath.startsWith("..") && relativePath !== ".")
}
