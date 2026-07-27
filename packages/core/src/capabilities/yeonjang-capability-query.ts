import type {
  YeonjangCapabilityItem,
  YeonjangCapabilityProjection,
  YeonjangCapabilityStatus,
} from "./yeonjang-capability-projection.js"

export interface YeonjangCapabilityQueryInput {
  search?: string
  location?: YeonjangCapabilityItem["location"]
  platform?: YeonjangCapabilityItem["platform"]
  status?: YeonjangCapabilityStatus
  cursor?: string
  limit?: number
}

export interface YeonjangCapabilityPage {
  items: YeonjangCapabilityItem[]
  nextCursor: string | null
  cursorValid: boolean
  totalMatches: number
  summary: YeonjangCapabilityProjection["summary"]
  observedAt: number
}

export function queryYeonjangCapabilityCatalog(
  projection: YeonjangCapabilityProjection,
  input: YeonjangCapabilityQueryInput = {},
): YeonjangCapabilityPage {
  const search = input.search?.trim().toLocaleLowerCase() ?? ""
  const filtered = projection.items.filter((item) => {
    if (search && !item.displayName.toLocaleLowerCase().includes(search)) return false
    if (input.location && item.location !== input.location) return false
    if (input.platform && item.platform !== input.platform) return false
    if (input.status && item.status !== input.status) return false
    return true
  })
  let start = 0
  if (input.cursor) {
    const index = filtered.findIndex((item) => item.yeonjangRef === input.cursor)
    if (index < 0)
      return {
        items: [],
        nextCursor: null,
        cursorValid: false,
        totalMatches: filtered.length,
        summary: projection.summary,
        observedAt: projection.observedAt,
      }
    start = index + 1
  }
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 50)))
  const items = filtered.slice(start, start + limit)
  const hasMore = start + items.length < filtered.length
  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.yeonjangRef ?? null) : null,
    cursorValid: true,
    totalMatches: filtered.length,
    summary: projection.summary,
    observedAt: projection.observedAt,
  }
}

export function resolveYeonjangCapabilityDetail(
  projection: YeonjangCapabilityProjection,
  yeonjangRef: string,
): YeonjangCapabilityItem | null {
  return projection.items.find((item) => item.yeonjangRef === yeonjangRef) ?? null
}
