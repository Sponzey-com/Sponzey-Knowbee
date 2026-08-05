import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  YEONJANG_HEARTBEAT_INTERVAL_MS,
  YEONJANG_SESSION_STALE_AFTER_MS,
} from "../packages/core/src/contracts/yeonjang-liveness-contract.ts"

describe("Yeonjang cross-runtime liveness contract", () => {
  it("keeps the Gateway stale window above two Rust heartbeat intervals", () => {
    expect(YEONJANG_HEARTBEAT_INTERVAL_MS).toBe(30_000)
    expect(YEONJANG_SESSION_STALE_AFTER_MS).toBe(90_000)
    expect(YEONJANG_SESSION_STALE_AFTER_MS).toBeGreaterThan(
      YEONJANG_HEARTBEAT_INTERVAL_MS * 2,
    )

    const rustMqtt = readFileSync("Yeonjang/src/mqtt.rs", "utf8")
    expect(rustMqtt).toContain(
      "const MQTT_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);",
    )
  })
})
