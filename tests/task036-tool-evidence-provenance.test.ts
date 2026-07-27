import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createArtifactStorageContextFromRoot } from "../packages/core/src/artifacts/lifecycle.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import { appLaunchTool } from "../packages/core/src/tools/builtin/app.ts"
import { fileSearchTool } from "../packages/core/src/tools/builtin/file-search.ts"
import {
  fileDeleteTool,
  fileListTool,
  filePatchTool,
  fileReadTool,
  fileWriteTool,
} from "../packages/core/src/tools/builtin/file.ts"
import {
  fileSemanticSearchTool,
  memorySearchTool,
  memoryStoreTool,
} from "../packages/core/src/tools/builtin/memory.ts"
import { shellExecTool } from "../packages/core/src/tools/builtin/shell.ts"
import {
  keyboardActionTool,
  keyboardShortcutTool,
  keyboardTypeTool,
} from "../packages/core/src/tools/builtin/ui/keyboard.ts"
import {
  mouseActionTool,
  mouseClickTool,
  mouseMoveTool,
} from "../packages/core/src/tools/builtin/ui/mouse.ts"
import {
  screenCaptureTool,
  screenFindTextTool,
} from "../packages/core/src/tools/builtin/ui/screen.ts"
import { webFetchTool } from "../packages/core/src/tools/builtin/web-fetch.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { AgentTool, ToolContext, ToolResult } from "../packages/core/src/tools/types.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

beforeAll(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task036-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterAll(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function context(): ToolContext {
  return {
    artifactStorage: createArtifactStorageContextFromRoot(process.cwd()),
    sessionId: "session-task036",
    runId: "run-task036",
    requestGroupId: "group-task036",
    workDir: process.cwd(),
    userMessage: "collect evidence",
    source: "webui",
    allowWebAccess: true,
    onProgress: () => undefined,
    signal: new AbortController().signal,
  }
}

function dispatcher(): ToolDispatcher {
  return new ToolDispatcher({
    config: {
      ...DEFAULT_CONFIG,
      security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
    },
  })
}

describe("Task036 exact tool evidence provenance", () => {
  it.each([
    ["web", webFetchTool],
    [
      "file",
      fileReadTool,
      fileWriteTool,
      fileListTool,
      filePatchTool,
      fileDeleteTool,
      fileSearchTool,
      fileSemanticSearchTool,
    ],
    ["memory", memoryStoreTool, memorySearchTool],
  ] as const)("declares %s provenance on every corresponding built-in", (sourceKind, ...tools) => {
    for (const tool of tools) expect(tool.evidenceSourceKind, tool.name).toBe(sourceKind)
  })

  it("uses the completed execution path for mixed local and Yeonjang results", async () => {
    const localOrRemote: AgentTool = {
      name: "mixed_path_probe",
      description: "mixed path probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      evidenceSourceKind: "tool",
      resolveEvidenceSourceKind: (result) =>
        (result.details as { via?: string } | undefined)?.via === "yeonjang" ? "yeonjang" : "tool",
      async execute(params: unknown): Promise<ToolResult> {
        const remote = (params as { remote?: boolean }).remote === true
        return {
          success: true,
          output: "secret raw adapter output",
          details: { via: remote ? "yeonjang" : "local" },
        }
      },
    }
    const toolDispatcher = dispatcher()
    toolDispatcher.register(localOrRemote)

    const local = await toolDispatcher.dispatch("mixed_path_probe", { remote: false }, context())
    const remote = await toolDispatcher.dispatch(
      "mixed_path_probe",
      { remote: true },
      {
        ...context(),
        runId: "run-task036-remote",
      },
    )

    expect(local.evidenceSource?.sourceKind).toBe("tool")
    expect(remote.evidenceSource?.sourceKind).toBe("yeonjang")
    expect(JSON.stringify(remote.evidenceSource)).not.toContain("secret raw adapter output")
  })

  it("snapshots a mixed resolver and fails closed when it returns an invalid source", async () => {
    const tool: AgentTool = {
      name: "invalid_source_probe",
      description: "invalid source probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      evidenceSourceKind: "tool",
      resolveEvidenceSourceKind: () => "invalid" as never,
      async execute() {
        return { success: true, output: "must not remain successful" }
      },
    }
    const toolDispatcher = dispatcher()
    toolDispatcher.register(tool)
    tool.resolveEvidenceSourceKind = () => "web"

    const result = await toolDispatcher.dispatch("invalid_source_probe", {}, context())

    expect(result.success).toBe(false)
    expect(result.error).toBe("tool_evidence_source_kind_invalid")
    expect(result.evidenceSource?.sourceKind).toBe("tool")
  })

  it("requires every mixed-runtime built-in to declare result-aware provenance", () => {
    const mixedTools = [
      appLaunchTool,
      shellExecTool,
      screenCaptureTool,
      screenFindTextTool,
      keyboardTypeTool,
      keyboardShortcutTool,
      keyboardActionTool,
      mouseMoveTool,
      mouseClickTool,
      mouseActionTool,
    ]

    for (const tool of mixedTools) {
      expect(tool.runtimeHealthMode, tool.name).toBe("additional")
      expect(tool.resolveEvidenceSourceKind, tool.name).toBeTypeOf("function")
      expect(
        tool.resolveEvidenceSourceKind?.({
          success: true,
          output: "remote",
          details: { via: "yeonjang" },
        }),
        tool.name,
      ).toBe("yeonjang")
      expect(
        tool.resolveEvidenceSourceKind?.({
          success: true,
          output: "local",
          details: { via: "local" },
        }),
        tool.name,
      ).toBe("tool")
    }
  })
})
