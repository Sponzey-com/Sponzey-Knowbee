import { describe, expect, it } from "vitest"
import { validateMcpConnectionDraft } from "../packages/core/src/capabilities/mcp-connection-validation.js"
import {
  type McpCatalogAdapterRow,
  createMcpConfigurationStore,
} from "../packages/core/src/capabilities/mcp-mutation-adapters.js"
import {
  type PersistedConfigFileSystem,
  readPersistedRawConfig,
} from "../packages/core/src/config/persisted-file.js"

const httpDraft = {
  displayName: " Penpot ",
  transport: "http",
  command: "",
  args: [],
  cwd: "",
  url: " https://mcp.example.test/endpoint?session=opaque ",
  required: true,
}

function memoryFileSystem(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial))
  const fileSystem: PersistedConfigFileSystem = {
    exists: (path) => files.has(path),
    makeDirectory: () => {},
    readText: (path) => files.get(path) ?? "",
    writeText: (path, content) => {
      files.set(path, content)
    },
    rename: (source, target) => {
      const content = files.get(source)
      if (content === undefined) throw new Error("missing")
      files.set(target, content)
      files.delete(source)
    },
    remove: (path) => {
      files.delete(path)
    },
  }
  return { fileSystem }
}

describe("task033 HTTP MCP configuration contract", () => {
  it("normalizes HTTP endpoints without accepting stdio fields", () => {
    expect(validateMcpConnectionDraft(httpDraft)).toEqual({
      valid: true,
      reasonCodes: [],
      draft: {
        displayName: "Penpot",
        transport: "http",
        command: "",
        args: [],
        cwd: "",
        url: "https://mcp.example.test/endpoint?session=opaque",
        required: true,
      },
    })
    expect(validateMcpConnectionDraft({ ...httpDraft, command: "node" }).reasonCodes).toContain(
      "mcp_transport_fields_mixed",
    )
    expect(validateMcpConnectionDraft({ ...httpDraft, args: ["--stdio"] }).reasonCodes).toContain(
      "mcp_transport_fields_mixed",
    )
    expect(validateMcpConnectionDraft({ ...httpDraft, cwd: "/tmp" }).reasonCodes).toContain(
      "mcp_transport_fields_mixed",
    )
  })

  it("rejects unsafe or malformed HTTP endpoints", () => {
    expect(
      validateMcpConnectionDraft({ ...httpDraft, url: "file:///tmp/server" }).reasonCodes,
    ).toContain("mcp_url_protocol_invalid")
    expect(
      validateMcpConnectionDraft({ ...httpDraft, url: "https://user:secret@example.test/mcp" })
        .reasonCodes,
    ).toContain("mcp_url_credentials_forbidden")
    expect(
      validateMcpConnectionDraft({ ...httpDraft, url: "https://example.test/mcp#secret" })
        .reasonCodes,
    ).toContain("mcp_url_fragment_forbidden")
    expect(validateMcpConnectionDraft({ ...httpDraft, url: "" }).reasonCodes).toContain(
      "mcp_url_missing",
    )
  })

  it("persists only HTTP fields, restores them in drafts and rolls back exactly", () => {
    const configFile = "/state/config.json5"
    const initialRaw = {
      mcp: {
        revision: 4,
        servers: {
          penpot: {
            enabled: true,
            transport: "stdio",
            command: "node",
            args: ["server.mjs"],
            cwd: "/workspace",
          },
        },
      },
    }
    const memory = memoryFileSystem({ [configFile]: JSON.stringify(initialRaw) })
    let rows: McpCatalogAdapterRow[] = [
      {
        internalMcpId: "mcp:penpot",
        status: "enabled",
        displayName: "Penpot",
        risk: "safe",
        toolNames: [],
        metadata: { transport: "stdio" },
        source: "manual",
        auditId: null,
        createdAt: 1,
        updatedAt: 4,
      },
    ]
    const store = createMcpConfigurationStore({
      paths: { configFile },
      initialConfig: { mcp: initialRaw.mcp as never },
      fileSystem: memory.fileSystem,
      catalog: {
        list: () => rows,
        write: (row) => {
          rows = [...rows.filter((item) => item.internalMcpId !== row.internalMcpId), row]
        },
      },
    })

    const validated = validateMcpConnectionDraft(httpDraft)
    expect(validated.valid).toBe(true)
    if (!validated.valid || !validated.draft) throw new Error("expected valid HTTP draft")
    const result = store.persist({
      mode: "update",
      internalMcpId: "mcp:penpot",
      draft: validated.draft,
      expectedRevision: 4,
      targetRevision: 5,
    })
    expect(result).toMatchObject({ ok: true, revision: 5 })
    const persisted = readPersistedRawConfig({ configFile }, memory.fileSystem) as {
      mcp?: { servers?: Record<string, unknown> }
    }
    expect(persisted.mcp?.servers?.penpot).toEqual({
      enabled: true,
      transport: "http",
      url: "https://mcp.example.test/endpoint?session=opaque",
      required: true,
    })
    expect(store.listEntries()[0]?.draft).toEqual(validated.draft)
    if (!result.rollbackSnapshot) throw new Error("expected rollback snapshot")
    expect(store.rollback(result.rollbackSnapshot)).toEqual({ ok: true })
    expect(readPersistedRawConfig({ configFile }, memory.fileSystem)).toEqual(initialRaw)
  })
})
