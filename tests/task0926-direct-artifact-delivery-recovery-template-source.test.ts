import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildDirectArtifactDeliveryRecoveryPrompt } from "../packages/core/src/runs/recovery.ts"

describe("task0926 direct artifact delivery recovery prompt source", () => {
  it("registers direct artifact delivery recovery input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "direct_artifact_delivery_recovery_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "direct_artifact_delivery_recovery_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/direct_artifact_delivery_recovery_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{previousResult}}")
    expect(source?.content).toContain("{{successfulTools}}")
    expect(source?.content).toContain("{{successfulFileDeliveries}}")
    expect(source?.content).toContain("{{alternatives}}")
  })

  it("renders the recovery prompt from the prompt source with runtime evidence", () => {
    const prompt = buildDirectArtifactDeliveryRecoveryPrompt({
      originalRequest: "화면 캡처해서 보내줘",
      previousResult: "캡처는 되었지만 전달되지 않았습니다.",
      successfulTools: [{ toolName: "screen_capture", output: "ok" }],
      successfulFileDeliveries: [{ channel: "telegram", filePath: `${process.env.HOME ?? ""}/capture.png` }],
      alternatives: [{ kind: "same_channel_retry", label: "같은 채널 재전송 시도" }],
    })

    expect(prompt).toContain("[Direct Artifact Delivery Recovery]")
    expect(prompt).toContain("Original user request:\n화면 캡처해서 보내줘")
    expect(prompt).toContain("Previous result:\n캡처는 되었지만 전달되지 않았습니다.")
    expect(prompt).toContain("Successful tool executions:\n1. screen_capture")
    expect(prompt).toContain("Already delivered files:\n1. telegram:")
    expect(prompt).toContain("Preferred alternatives:\n- 같은 채널 재전송 시도")
  })

  it("does not keep the direct artifact delivery recovery envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/recovery.ts", "utf-8")

    expect(source).toContain('sourceId: "direct_artifact_delivery_recovery_user"')
    expect(source).not.toContain("[Direct Artifact Delivery Recovery]")
    expect(source).not.toContain("사용자는 결과물 자체를 보여주거나 보내달라고 요청했습니다.")
    expect(source).not.toContain("전달 채널은 현재 사용자 요청이 들어온 채널로 고정하세요.")
  })
})
