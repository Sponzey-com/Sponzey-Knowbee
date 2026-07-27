import { describe, expect, it } from "vitest"
import {
  DEFAULT_MAIN_AGENT_NAME_EN,
  DEFAULT_MAIN_AGENT_NAME_KO,
  KNOWBEE_PRODUCT_NAME,
  KNOWBEE_PRODUCT_NAME_KO,
  buildMainAgentPromptVariables,
  resolveMainAgentSelfName,
} from "../packages/core/src/agent/main-agent-identity.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

describe("task1197 product and main-agent identity boundary", () => {
  it("uses the exact English and Korean product names from GOAL", () => {
    expect(KNOWBEE_PRODUCT_NAME).toBe("Knowbee")
    expect(KNOWBEE_PRODUCT_NAME_KO).toBe("노비")
  })

  it("localizes only an unset main-agent name", () => {
    expect(DEFAULT_MAIN_AGENT_NAME_EN).toBe("Knowbee")
    expect(DEFAULT_MAIN_AGENT_NAME_KO).toBe("노비")
    expect(resolveMainAgentSelfName(DEFAULT_CONFIG, "en")).toBe("Knowbee")
    expect(resolveMainAgentSelfName(DEFAULT_CONFIG, "ko")).toBe("노비")
  })

  it("keeps a configured agent name separate from product and user profile names", () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: {
        ...DEFAULT_CONFIG.profile,
        profileName: "사용자 이름",
        displayName: "사용자 표시 이름",
      },
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        knowbee: {
          ...DEFAULT_CONFIG.orchestration.knowbee,
          agentName: "마당쇠",
          displayName: "legacy display",
          nickname: "legacy nickname",
        },
      },
    }

    expect(resolveMainAgentSelfName(config, "en")).toBe("마당쇠")
    expect(resolveMainAgentSelfName(config, "ko")).toBe("마당쇠")
    expect(buildMainAgentPromptVariables(config, "ko")).toEqual(expect.objectContaining({
      mainAgentName: "마당쇠",
      productName: "Knowbee",
      productNameKo: "노비",
    }))
  })
})
