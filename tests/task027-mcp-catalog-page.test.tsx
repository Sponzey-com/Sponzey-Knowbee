import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { localAdapter } from "../packages/webui/src/api/adapters/local.js"
import { McpCatalogView } from "../packages/webui/src/pages/McpCatalogPage.js"

const item = {
  mcpRef: `mcp_v1_${"a".repeat(24)}`,
  displayName: "Penpot",
  transport: "stdio" as const,
  configuredStatus: "enabled" as const,
  runtimeStatus: "ready" as const,
  required: false,
  toolCount: 1,
  bindingCount: 2,
  issueCode: null,
  revision: 7,
}

describe("task027 MCP catalog page", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", { getItem: () => null })
  })

  it("serializes list filters and forwards AbortSignal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ items: [item], nextCursor: null, revision: 7, observedAt: 10 }),
      })
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    await localAdapter.getMcpCatalog(
      { limit: 25, search: "pen", transport: "stdio", runtimeStatus: "ready", boundOnly: true },
      controller.signal,
    )
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/capabilities/mcp?limit=25&search=pen&transport=stdio&status=ready&bound=true",
    )
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it("renders a compact list and a lazy tool detail without internal fields", () => {
    const html = renderToStaticMarkup(
      createElement(McpCatalogView, {
        items: [item],
        selectedItem: { ...item, tools: [{ name: "inspect", description: "Inspect a design" }] },
        loading: false,
        loadingMore: false,
        detailLoading: false,
        error: null,
        nextCursor: null,
        search: "",
        transport: "",
        runtimeStatus: "",
        boundOnly: false,
        onSearchChange: () => undefined,
        onTransportChange: () => undefined,
        onRuntimeStatusChange: () => undefined,
        onBoundOnlyChange: () => undefined,
        onSelect: () => undefined,
        onCloseDetail: () => undefined,
        onRefresh: () => undefined,
        onLoadMore: () => undefined,
      }),
    )
    expect(html).toContain("Penpot")
    expect(html).toContain("inspect")
    expect(html).toContain("Inspect a design")
    expect(html).toContain("2개 에이전트 연결")
    expect(html).not.toMatch(/command|registeredName|internal|secret|private/)
  })

  it("renders loading, empty and error states explicitly", () => {
    const base = {
      items: [],
      selectedItem: null,
      loadingMore: false,
      detailLoading: false,
      nextCursor: null,
      search: "",
      transport: "" as const,
      runtimeStatus: "" as const,
      boundOnly: false,
      onSearchChange: () => undefined,
      onTransportChange: () => undefined,
      onRuntimeStatusChange: () => undefined,
      onBoundOnlyChange: () => undefined,
      onSelect: () => undefined,
      onCloseDetail: () => undefined,
      onRefresh: () => undefined,
      onLoadMore: () => undefined,
    }
    expect(
      renderToStaticMarkup(createElement(McpCatalogView, { ...base, loading: true, error: null })),
    ).toContain("MCP 목록 불러오는 중")
    expect(
      renderToStaticMarkup(createElement(McpCatalogView, { ...base, loading: false, error: null })),
    ).toContain("표시할 MCP 연결이 없습니다")
    const failed = renderToStaticMarkup(
      createElement(McpCatalogView, { ...base, loading: false, error: "mcp_catalog_read_failed" }),
    )
    expect(failed).toContain("기능 정보를 불러오지 못했습니다")
    expect(failed).toContain("상태 새로고침")
    expect(failed).not.toContain("mcp_catalog_read_failed")
  })

  it("registers the MCP route before the capability wildcard", () => {
    const source = readFileSync("packages/webui/src/App.tsx", "utf8")
    expect(source.indexOf('path="/capabilities/mcp"')).toBeGreaterThan(-1)
    expect(source.indexOf('path="/capabilities/mcp"')).toBeLessThan(
      source.indexOf('path="/capabilities/*"'),
    )
  })
})
