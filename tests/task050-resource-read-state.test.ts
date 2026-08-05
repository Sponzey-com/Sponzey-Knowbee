import { describe, expect, it } from "vitest"
import {
  initialResourceReadState,
  reduceResourceReadState,
} from "../packages/webui/src/lib/resource-read-state"
import { projectUserRecovery } from "../packages/webui/src/lib/user-recovery"

const failure = projectUserRecovery(new Error("raw /Users/private token=secret"), "read")

describe("Task050 canonical resource read-state", () => {
  it("distinguishes initial failure from stale verified data", () => {
    const initial = initialResourceReadState<{ value: string }>()
    const failed = reduceResourceReadState(initial, { type: "load_failed", failure })
    expect(failed).toEqual({
      status: "failed",
      data: null,
      observedAt: null,
      failure,
    })

    const data = { value: "verified" }
    const ready = reduceResourceReadState(initial, {
      type: "load_succeeded",
      data,
      observedAt: 100,
    })
    const loading = reduceResourceReadState(ready, { type: "load_started" })
    const stale = reduceResourceReadState(loading, { type: "load_failed", failure })
    expect(stale).toEqual({ status: "stale", data, observedAt: 100, failure })
    expect(stale.data).toBe(data)
  })

  it("clears a prior failure after an authoritative success", () => {
    const failed = reduceResourceReadState(initialResourceReadState<number>(), {
      type: "load_failed",
      failure,
    })
    expect(
      reduceResourceReadState(failed, {
        type: "load_succeeded",
        data: 7,
        observedAt: 200,
      }),
    ).toEqual({ status: "ready", data: 7, observedAt: 200, failure: null })
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid observedAt %s",
    (observedAt) => {
      expect(() =>
        reduceResourceReadState(initialResourceReadState(), {
          type: "load_succeeded",
          data: {},
          observedAt,
        }),
      ).toThrow("resource_read_observed_at_invalid")
    },
  )
})
