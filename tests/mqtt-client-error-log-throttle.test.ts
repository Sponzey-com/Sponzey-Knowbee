import { describe, expect, it } from "vitest"
import { createMqttClientErrorLogThrottle } from "../packages/core/src/mqtt/client-error-log-throttle.js"

describe("MQTT client error log throttle", () => {
  it("emits the first failure, bounds repeated failures, and reports the suppressed count", () => {
    let now = 1_000
    const throttle = createMqttClientErrorLogThrottle({
      windowMs: 30_000,
      maxKeys: 2,
      nowMs: () => now,
    })

    expect(throttle.admit("client-a:authentication")).toEqual({ emit: true, suppressed: 0 })
    expect(throttle.admit("client-a:authentication")).toEqual({ emit: false, suppressed: 1 })
    now += 29_999
    expect(throttle.admit("client-a:authentication")).toEqual({ emit: false, suppressed: 2 })
    now += 1
    expect(throttle.admit("client-a:authentication")).toEqual({ emit: true, suppressed: 2 })
  })

  it("keeps memory bounded and clears process-local state at broker shutdown", () => {
    let now = 1_000
    const throttle = createMqttClientErrorLogThrottle({ windowMs: 30_000, maxKeys: 2, nowMs: () => now })
    expect(throttle.admit("client-a:error").emit).toBe(true)
    now += 1
    expect(throttle.admit("client-b:error").emit).toBe(true)
    now += 1
    expect(throttle.admit("client-c:error").emit).toBe(true)
    expect(throttle.size()).toBe(2)
    expect(throttle.admit("client-a:error")).toEqual({ emit: true, suppressed: 0 })
    throttle.clear()
    expect(throttle.size()).toBe(0)
  })
})
