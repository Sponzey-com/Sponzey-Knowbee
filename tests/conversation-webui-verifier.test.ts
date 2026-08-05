import { describe, expect, it } from "vitest"
import {
  validateBrowserObservation,
} from "../scripts/self/verify-conversation-webui.mjs"

const observation = {
  schemaVersion: 1,
  baseUrl: "http://127.0.0.1:4220",
  gatewayUrl: "http://127.0.0.1:18888",
  viewports: [
    {
      width: 390,
      height: 844,
      horizontalOverflow: false,
      composerVisible: true,
      composerEditable: true,
      keyboardSubmitVerified: true,
      shiftEnterVerified: true,
      imeVerified: true,
      focusVerified: true,
      accessibleStatusPresent: true,
      recoveryControlsPresent: true,
    },
    {
      width: 1440,
      height: 900,
      horizontalOverflow: false,
      composerVisible: true,
      composerEditable: true,
      keyboardSubmitVerified: true,
      shiftEnterVerified: true,
      imeVerified: true,
      focusVerified: true,
      accessibleStatusPresent: true,
      recoveryControlsPresent: true,
    },
  ],
}

describe("conversation WebUI browser evidence verifier", () => {
  it("accepts both required viewports only with interaction and accessibility checks", () => {
    expect(validateBrowserObservation(observation, {
      baseUrl: observation.baseUrl,
      gatewayUrl: observation.gatewayUrl,
      viewports: ["390x844", "1440x900"],
    })).toEqual({ ok: true, failures: [] })
  })

  it("rejects overflow and missing IME evidence", () => {
    const invalid = structuredClone(observation)
    invalid.viewports[0]!.horizontalOverflow = true
    invalid.viewports[1]!.imeVerified = false

    expect(validateBrowserObservation(invalid, {
      baseUrl: observation.baseUrl,
      gatewayUrl: observation.gatewayUrl,
      viewports: ["390x844", "1440x900"],
    })).toEqual({
      ok: false,
      failures: [
        "horizontal_overflow:390x844",
        "ime_unverified:1440x900",
      ],
    })
  })
})
