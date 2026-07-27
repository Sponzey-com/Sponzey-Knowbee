import { afterEach, describe, expect, it } from "vitest"
import { closeDb, getDb, getDbRuntimeState } from "../packages/core/src/db/index.js"
import { createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

afterEach(() => {
  closeDb()
})

describe("task1168 DB runtime fixture ownership", () => {
  it("reports an uninitialized runtime separately from an owner conflict", () => {
    expect(getDbRuntimeState()).toBe("uninitialized")
    expect(() => getDb()).toThrow("Primary database runtime is not initialized.")
  })

  it("disposes its runtime idempotently", () => {
    const fixture = createTestDbRuntimeFixture("knowbee-task1168-owner-")

    expect(getDbRuntimeState()).toBe("ready")
    fixture.dispose()
    fixture.dispose()
    expect(getDbRuntimeState()).toBe("uninitialized")
  })

  it("does not close a replacement runtime owned by another fixture", () => {
    const staleFixture = createTestDbRuntimeFixture("knowbee-task1168-stale-")
    closeDb()
    const activeFixture = createTestDbRuntimeFixture("knowbee-task1168-active-")

    expect(() => staleFixture.dispose()).toThrow(
      "Primary database runtime is already initialized for another instance.",
    )
    expect(activeFixture.db.prepare("SELECT 1 AS value").get()).toEqual({ value: 1 })
    expect(getDbRuntimeState()).toBe("ready")

    activeFixture.dispose()
    staleFixture.dispose()
  })
})
