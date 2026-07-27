import { describe, expect, it } from "vitest"
import {
  detectPrimaryMessageLanguage,
} from "../packages/core/src/channels/language.ts"

describe("task0851 channel primary language detector", () => {
  it("detects single-language Korean and English text", () => {
    expect(detectPrimaryMessageLanguage("메인 화면을 캡쳐해줘")).toBe("ko")
    expect(detectPrimaryMessageLanguage("Please capture the main screen")).toBe("en")
  })

  it("uses the primary language for mixed Korean and English text", () => {
    expect(detectPrimaryMessageLanguage("메인 화면 capture 해줘")).toBe("ko")
    expect(detectPrimaryMessageLanguage("Please ask 노비 to capture the screen")).toBe("en")
  })

  it("returns unknown when no supported language signal exists", () => {
    expect(detectPrimaryMessageLanguage("12345")).toBe("unknown")
  })
})
