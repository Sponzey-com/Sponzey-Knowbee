import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { getVectorBackendStatus } from "../packages/core/src/memory/embedding.ts"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1066 memory embedding config snapshot", () => {
  it("uses explicit memory config snapshots for embedding providers", () => {
    const embeddingSource = source("packages/core/src/memory/embedding.ts")
    const typesSource = source("packages/core/src/tools/types.ts")
    const dispatcherSource = source("packages/core/src/tools/dispatcher.ts")
    const storeSource = source("packages/core/src/memory/store.ts")
    const searchSource = source("packages/core/src/memory/search.ts")
    const fileIndexerSource = source("packages/core/src/memory/file-indexer.ts")
    const settingsSource = source("packages/core/src/api/routes/settings.ts")
    const agentSource = source("packages/core/src/agent/index.ts")
    const memoryToolSource = source("packages/core/src/tools/builtin/memory.ts")

    expect(embeddingSource).not.toContain("getConfig()")
    expect(embeddingSource).not.toContain("../config/index.js")
    expect(embeddingSource).toContain("getEmbeddingProvider(memoryConfig?: EmbeddingMemoryConfig)")
    expect(embeddingSource).toContain("getVectorBackendStatus(memoryConfig?: EmbeddingMemoryConfig)")
    expect(typesSource).toContain("memoryConfig?: MemoryConfig")
    expect(legacyConfigAccesses(dispatcherSource)).toEqual([])
    expect(functionParameterTypes(dispatcherSource, "buildRuntimeToolContext")).toEqual([[
      "ToolContext",
      "ToolRuntimeConfigSnapshot",
    ]])
    expect(callArgumentCounts(dispatcherSource, "buildRuntimeToolContext")).toEqual([2])
    expect(storeSource).toContain("ensureChunkEmbeddings(result.documentId, result.chunkIds, params.memoryConfig)")
    expect(storeSource).toContain("getEmbeddingProvider(params.memoryConfig)")
    expect(searchSource).toContain("getEmbeddingProvider(options?.memoryConfig)")
    expect(fileIndexerSource).toContain("getEmbeddingProvider(options.memoryConfig)")
    expect(settingsSource).toContain("getVectorBackendStatus(cfg.memory)")
    expect(agentSource).toContain("memoryConfig: config.memory")
    expect(memoryToolSource).toContain("memoryConfig: ctx.memoryConfig")
  })

  it("degrades to no vector backend without an explicit memory config snapshot", () => {
    expect(getVectorBackendStatus()).toEqual({
      available: false,
      backend: "none",
      reason: "embedding provider is not configured",
    })
  })
})
