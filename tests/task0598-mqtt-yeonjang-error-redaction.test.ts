import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { isYeonjangUnavailableError } from "../packages/core/src/yeonjang/mqtt-client.ts"

describe("task0598 MQTT and Yeonjang error redaction", () => {
  it("keeps persisted MQTT broker and Yeonjang delivery failures behind redaction helpers", () => {
    const brokerSource = readFileSync("packages/core/src/mqtt/broker.ts", "utf-8")
    const clientSource = readFileSync("packages/core/src/yeonjang/mqtt-client.ts", "utf-8")

    expect(brokerSource).toContain("function mqttBrokerErrorMessage(error: unknown): string")
    expect(clientSource).toContain("function yeonjangMqttErrorMessage(error: unknown): string")
    expect(brokerSource).toContain("return redactLogText(raw)")
    expect(clientSource).toContain("return redactLogText(raw)")
    expect(clientSource).toContain("const message = yeonjangMqttErrorMessage(error)")
    expect(brokerSource).not.toContain("reason: error.message")
    expect(brokerSource).not.toContain("log.error(`MQTT server error: ${error.message}`)")
    expect(brokerSource).not.toMatch(/const message = error instanceof Error \? error\.message : String\(error\)/u)
    expect(clientSource).not.toMatch(/error: error instanceof Error \? error\.message : String\(error\)/u)
    expect(clientSource).not.toMatch(/JSON 파싱 실패: \$\{error instanceof Error \? error\.message : String\(error\)\}/u)
    expect(clientSource).not.toMatch(/청크 응답 복원 실패: \$\{error instanceof Error \? error\.message : String\(error\)\}/u)
    expect(clientSource).toContain("new Error(yeonjangMqttErrorMessage(error?.message ??")
  })

  it("preserves Yeonjang unavailable classification semantics", () => {
    expect(isYeonjangUnavailableError(new Error("ECONNREFUSED 127.0.0.1:1883"))).toBe(true)
    expect(isYeonjangUnavailableError(new Error("Yeonjang MQTT 응답 시간이 초과되었습니다."))).toBe(true)
    expect(isYeonjangUnavailableError(new Error("extension command rejected"))).toBe(false)
  })
})
