import { discoverInstructionChain, type AgentInstructionSourceInput, type InstructionChain } from "./discovery.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"
import { dirname } from "node:path"

const CACHE_TTL_MS = 5_000
const INSTRUCTION_MERGE_CONTEXT_LABELS_SOURCE_ID = "instruction_merge_context_labels_user"

export interface MergedInstructionBundle {
  chain: InstructionChain
  mergedText: string
}

export interface MergedInstructionOptions {
  globalStateDir: string
  fallbackBoundaryDir: string
  agentSources?: AgentInstructionSourceInput[]
}

export type InstructionRuntimeContext = Pick<
  MergedInstructionOptions,
  "globalStateDir" | "fallbackBoundaryDir"
>

export function createInstructionRuntimeContext(stateDir: string): InstructionRuntimeContext {
  return Object.freeze({
    globalStateDir: stateDir,
    fallbackBoundaryDir: dirname(stateDir),
  })
}

interface CacheEntry {
  expiresAt: number
  signature: string
  bundle: MergedInstructionBundle
}

const bundleCache = new Map<string, CacheEntry>()

export function loadMergedInstructions(
  workDir: string,
  options: MergedInstructionOptions,
): MergedInstructionBundle {
  const chain = discoverInstructionChain({
    workDir,
    globalStateDir: options.globalStateDir,
    fallbackBoundaryDir: options.fallbackBoundaryDir,
    ...(options.agentSources ? { agentSources: options.agentSources } : {}),
  })
  const signature = buildChainSignature(chain)
  const cacheKey = buildCacheKey(workDir, options)
  const cached = bundleCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() && cached.signature === signature) {
    return cached.bundle
  }

  const mergedText = chain.sources
    .filter((source) => source.loaded && source.content?.trim())
    .map((source, index) => [
      instructionMergeContextLabel(
        source.sourceKind === "agent_prompt" ? "agent_instruction_source_header" : "instruction_source_header",
        { index: index + 1 },
      ),
      `path: ${source.path}`,
      `scope: ${source.scope}`,
      source.agentId ? `agentId: ${source.agentId}` : "",
      source.agentType ? `agentType: ${source.agentType}` : "",
      source.content?.trim() ?? "",
    ].filter(Boolean).join("\n"))
    .join("\n\n")

  const bundle = { chain, mergedText }
  bundleCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    signature,
    bundle,
  })
  return bundle
}

function instructionMergeContextLabel(key: string, variables: Record<string, string | number> = {}): string {
  const value = loadPromptValue(INSTRUCTION_MERGE_CONTEXT_LABELS_SOURCE_ID, variables, { required: true })
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1)
    .trim()
  if (!value) {
    throw new Error(`instruction merge context label missing: ${key}`)
  }
  return value
}

function buildCacheKey(workDir: string, options: MergedInstructionOptions): string {
  if (!options.agentSources?.length) return workDir
  return [
    workDir,
    ...options.agentSources.map((source) => [
      source.agentType,
      source.agentId,
      source.sourceId,
      source.version ?? "",
      source.content,
    ].join(":")),
  ].join("|")
}

function buildChainSignature(chain: InstructionChain): string {
  return chain.sources.map((source) => (
    [
      source.path,
      source.scope,
      source.level,
      source.loaded ? "1" : "0",
      source.size,
      source.mtimeMs ?? 0,
      source.content ?? "",
      source.error ?? "",
    ].join(":")
  )).join("|")
}
