import { describe, expect, it } from "vitest"
import { buildStartPreflightResponseContext } from "../packages/core/src/runs/start.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"

describe("task0058 start preflight response context", () => {
  it("builds response context when model, provider id, and work dir are present", () => {
    expect(buildStartPreflightResponseContext({
      config: DEFAULT_CONFIG,
      originalRequest: "화면 캡처해줘",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })).toEqual({
      originalRequest: "화면 캡처해줘",
      model: "gpt-test",
      providerId: "openai",
      config: DEFAULT_CONFIG,
      workDir: "/tmp/project",
    })
  })

  it("does not build response context without a provider target", () => {
    expect(buildStartPreflightResponseContext({
      config: DEFAULT_CONFIG,
      originalRequest: "화면 캡처해줘",
      model: "gpt-test",
      workDir: "/tmp/project",
    })).toBeUndefined()
  })
})
