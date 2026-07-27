import { describe, expect, it } from "vitest"
import {
  queryYeonjangCapabilityCatalog,
  resolveYeonjangCapabilityDetail,
} from "../packages/core/src/capabilities/yeonjang-capability-query.js"

function item(index: number) {
  return {
    yeonjangRef: `yeonjang_v1_${index.toString(16).padStart(24, "0")}`,
    displayName: `Device ${index.toString().padStart(3, "0")}`,
    location: index % 2 ? ("remote" as const) : ("local" as const),
    platform:
      index % 3 === 0
        ? ("linux" as const)
        : index % 3 === 1
          ? ("windows" as const)
          : ("macos" as const),
    supportProfile: "desktop_interactive" as const,
    status: index % 5 === 0 ? ("permission_required" as const) : ("ready" as const),
    permissionState: index % 5 === 0 ? ("required" as const) : ("ready" as const),
    lastSeenAt: 1_000 - index,
    lastSeenAgeMs: index,
    stale: false,
    runnable: index % 5 !== 0,
    capabilityGroups: ["system" as const],
    actionableIssue: index % 5 === 0 ? ("yeonjang_permission_required" as const) : null,
  }
}

const projection = {
  items: Array.from({ length: 100 }, (_, index) => item(index)),
  summary: {
    total: 100,
    ready: 80,
    local: 50,
    remote: 50,
    permissionRequired: 20,
    stale: 0,
    duplicateInstanceDetected: false,
    knowbeeFallbackAvailable: true as const,
    computerControlAvailable: true,
  },
  observedAt: 1_000,
}

describe("task034 Yeonjang capability query", () => {
  it("filters and paginates with a stable public cursor", () => {
    const first = queryYeonjangCapabilityCatalog(projection, {
      search: "device",
      location: "remote",
      platform: "windows",
      status: "ready",
      limit: 4,
    })
    expect(first.items).toHaveLength(4)
    expect(
      first.items.every(
        (entry) =>
          entry.location === "remote" && entry.platform === "windows" && entry.status === "ready",
      ),
    ).toBe(true)
    expect(first.nextCursor).toMatch(/^yeonjang_v1_/u)
    const nextCursor = first.nextCursor
    if (!nextCursor) throw new Error("expected_next_cursor")
    const second = queryYeonjangCapabilityCatalog(projection, {
      location: "remote",
      platform: "windows",
      status: "ready",
      limit: 4,
      cursor: nextCursor,
    })
    expect(second.items[0]?.yeonjangRef).not.toBe(first.items[0]?.yeonjangRef)
    expect(second.items.map((entry) => entry.yeonjangRef)).not.toEqual(
      first.items.map((entry) => entry.yeonjangRef),
    )
  })

  it("returns an empty page for an unknown cursor without leaking an internal position", () => {
    expect(
      queryYeonjangCapabilityCatalog(projection, { cursor: "yeonjang_v1_unknown", limit: 10 }),
    ).toMatchObject({ items: [], nextCursor: null, cursorValid: false })
  })

  it("resolves detail only by the public reference", () => {
    const target = projection.items[7]
    expect(resolveYeonjangCapabilityDetail(projection, target.yeonjangRef)).toEqual(target)
    expect(resolveYeonjangCapabilityDetail(projection, "internal-instance-7")).toBeNull()
  })
})
