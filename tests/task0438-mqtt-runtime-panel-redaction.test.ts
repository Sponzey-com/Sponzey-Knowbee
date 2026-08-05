import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "MqttRuntimePanel.tsx"),
  "utf-8",
)

describe("task0438 mqtt runtime panel redaction", () => {
  it("does not render extension internal identifiers in the default panel", () => {
    expect(source).not.toContain("ID: <span")
    expect(source).not.toContain("Client: <span")
    expect(source).not.toContain("Version: <span")
    expect(source).not.toContain("Protocol: <span")
    expect(source).not.toContain("Capability: <span")
    expect(source).not.toContain("extension.displayName?.trim() || extension.extensionId")

    expect(source).toContain('text("연동 기준 확인됨", "Connection baseline verified")')
    expect(source).toContain('text("기능 기준 연결됨", "Capability baseline linked")')
    expect(source).toContain('text("이름 없는 연장", "Unnamed extension")')
  })

  it("summarizes methods and payloads instead of rendering raw method names or JSON", () => {
    expect(source).not.toContain("function formatPayload")
    expect(source).not.toContain("JSON.stringify(payload")
    expect(source).not.toContain("formatPayload(entry.payload)")
    expect(source).not.toContain("<pre")
    expect(source).not.toContain("{method}")
    expect(source).not.toContain('text("메서드 수", "Method count")')

    expect(source).toContain("function summarizePayload")
    expect(source).toContain("summarizePayload(entry.payload, text)")
    expect(source).toContain('text("실행 기능", "Runnable features")')
    expect(source).toContain('text("기능 목록 기록됨", "Feature list recorded")')
  })

  it("uses exchange-history wording instead of JSON log wording", () => {
    expect(source).not.toContain("JSON Exchange Log")
    expect(source).not.toContain("주고받은 JSON 로그")
    expect(source).not.toContain("MQTT JSON")
    expect(source).not.toContain("entry.topic}</span>")
    expect(source).not.toContain("entry.extensionId}</span>")

    expect(source).toContain('text("연장 연동 기록", "Extension exchange history")')
    expect(source).toContain('text("전송 경로 기록됨", "Route recorded")')
    expect(source).toContain('text("연장 기준 연결됨", "Extension baseline linked")')
  })
})

