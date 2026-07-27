import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import type { CapabilityPolicy } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import { McpStdioClient } from "../packages/core/src/mcp/client.ts"
import { mcpRegistry } from "../packages/core/src/mcp/registry.ts"
import {
  initializeToolDispatcher,
  toolDispatcher,
} from "../packages/core/src/tools/index.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = resolve(__dirname, "fixtures/fake-mcp-server.mjs")
const stateDir = mkdtempSync(resolve(tmpdir(), "knowbee-mcp-client-"))

beforeAll(() => {
  initializeTestDbRuntime(stateDir)
  initializeToolDispatcher(DEFAULT_CONFIG)
})

afterAll(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

afterEach(async () => {
  await mcpRegistry.closeAll()
})

describe("MCP stdio client", () => {
  it("uses a constructor env snapshot instead of spreading process.env during spawn", () => {
    const source = readFileSync(new URL("../packages/core/src/mcp/client.ts", import.meta.url), "utf-8")

    expect(source).toContain("baseEnv?: NodeJS.ProcessEnv")
    expect(source).toContain("const MCP_BASE_ENV")
    expect(source).toContain("...this.baseEnv")
    expect(source).not.toContain("options.baseEnv ?? process.env")
    expect(source).not.toContain("...process.env,")
  })

  it("initializes a stdio MCP server and calls a tool", async () => {
    const client = new McpStdioClient({
      name: "fake",
      defaultCwd: __dirname,
      config: {
        command: process.execPath,
        args: [fixture],
        startupTimeoutSec: 3,
        toolTimeoutSec: 3,
      },
    })

    await client.initialize()
    const tools = await client.listTools()
    expect(tools.map((tool) => tool.name)).toEqual(["echo", "sum"])

    const result = await client.callTool("echo", { text: "hello mcp" })
    expect(result.output).toBe("hello mcp")

    await client.close()
  })

  it("settles initialization once when the child exits during the first write", async () => {
    const onExit = vi.fn()
    const client = new McpStdioClient({
      name: "exit-during-initialize",
      defaultCwd: __dirname,
      onExit,
      config: {
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        startupTimeoutSec: 1,
        toolTimeoutSec: 1,
      },
    })

    await expect(client.initialize()).rejects.toThrow(/External feature connection/)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onExit).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it("registers MCP tools into the tool dispatcher", async () => {
    await mcpRegistry.loadFromConfig({
      ...DEFAULT_CONFIG,
      mcp: {
        servers: {
          fake: {
            command: process.execPath,
            args: [fixture],
            startupTimeoutSec: 3,
            toolTimeoutSec: 3,
          },
        },
      },
    })

    const tool = toolDispatcher.get("mcp__fake__echo")
    expect(tool).toBeDefined()

    const capabilityPolicy: CapabilityPolicy = {
      permissionProfile: {
        profileId: "profile:mcp-test",
        riskCeiling: "dangerous",
        approvalRequiredFrom: "dangerous",
        allowExternalNetwork: true,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPaths: [],
      },
      skillMcpAllowlist: {
        enabledSkillIds: [],
        enabledMcpServerIds: ["fake"],
        enabledToolNames: ["mcp__fake__echo", "echo"],
        disabledToolNames: [],
        secretScopeId: "secret:mcp-test",
      },
      rateLimit: { maxConcurrentCalls: 1 },
    }
    const result = await toolDispatcher.dispatch(
      "mcp__fake__echo",
      { text: "from registry" },
      {
        sessionId: "test-session",
        runId: "test-run",
        requestGroupId: "test-group",
        workDir: process.cwd(),
        userMessage: "test",
        source: "cli",
        allowWebAccess: false,
        onProgress: () => {},
        signal: new AbortController().signal,
        agentId: "agent:mcp-test",
        agentType: "sub_agent",
        capabilityPolicy,
        secretScopeId: "secret:mcp-test",
        auditId: "audit:mcp-test",
      },
    )

    expect(result.success).toBe(true)
    expect(result.output).toBe("from registry")
  })
})
