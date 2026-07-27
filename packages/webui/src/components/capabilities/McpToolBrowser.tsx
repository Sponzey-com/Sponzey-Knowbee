import React, { useMemo, useState } from "react"
import type { McpCatalogDetail } from "../../contracts/mcp"
import { useUiI18n } from "../../lib/ui-i18n"
import { StatusLabel } from "../ui/StatusLabel"

type McpTool = McpCatalogDetail["tools"][number]

export function filterMcpTools(tools: readonly McpTool[], search: string): McpTool[] {
  const query = search.trim().toLocaleLowerCase()
  return query
    ? tools.filter((tool) => `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(query))
    : [...tools]
}

export function McpToolBrowser({ tools }: { tools: readonly McpTool[] }) {
  const { text } = useUiI18n()
  const [search, setSearch] = useState("")
  const agents = useMemo(() => {
    const found = new Map<string, string>()
    for (const tool of tools) for (const access of tool.access ?? []) found.set(access.agentRef, access.agentName)
    return [...found].map(([agentRef, name]) => ({ agentRef, name })).sort((left, right) => left.name.localeCompare(right.name) || left.agentRef.localeCompare(right.agentRef))
  }, [tools])
  const [selectedAgentRef, setSelectedAgentRef] = useState(agents[0]?.agentRef ?? "")
  const filtered = useMemo(() => filterMcpTools(tools, search), [search, tools])
  return <section className="border-t border-stone-200 pt-4" aria-labelledby="mcp-tools-title">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 id="mcp-tools-title" className="text-sm font-semibold">{text("사용 가능한 도구", "Available tools")}</h3><p className="mt-1 text-sm text-stone-500">{text(`${filtered.length}개 결과`, `${filtered.length} results`)}</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium sm:w-52"><span>{text("도구 검색", "Search tools")}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text("이름 또는 설명", "Name or description")} className="min-h-11 min-w-0 rounded-[var(--ui-surface-radius)] border border-stone-300 px-3" /></label>
        {agents.length ? <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium sm:w-44"><span>{text("에이전트", "Agent")}</span><select value={selectedAgentRef} onChange={(event) => setSelectedAgentRef(event.target.value)} className="min-h-11 min-w-0 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3">{agents.map((agent) => <option key={agent.agentRef} value={agent.agentRef}>{agent.name}</option>)}</select></label> : null}
      </div>
    </div>
    <div className="mt-3 divide-y divide-stone-200">
      {filtered.length ? filtered.map((tool) => {
        const access = tool.access?.find((entry) => entry.agentRef === selectedAgentRef)
        const label = access?.status === "allowed" ? text("허용", "Allowed") : access?.status === "disabled" ? text("사용 안 함", "Disabled") : access?.status === "not_bound" ? text("연결 안 됨", "Not bound") : null
        return <div key={tool.name} className="flex min-h-14 items-start justify-between gap-3 py-3"><div className="min-w-0"><div className="break-words text-sm font-medium">{tool.name}</div><p className="mt-1 break-words text-sm leading-6 text-stone-600">{tool.description || text("설명이 없습니다.", "No description.")}</p></div>{label ? <StatusLabel tone={access?.status === "allowed" ? "success" : "neutral"}>{label}</StatusLabel> : null}</div>
      }) : <p className="py-3 text-sm text-stone-500">{search.trim() ? text("검색 결과가 없습니다.", "No tools match the search.") : text("현재 사용할 수 있는 도구가 없습니다.", "No tools are currently available.")}</p>}
    </div>
  </section>
}
