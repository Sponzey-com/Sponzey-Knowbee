import { describe, expect, it } from "vitest"
import { validateIdentityClaim } from "../packages/core/src/agent/identity-claim.ts"

describe("task047 identity claim validation", () => {
  it("accepts exact trusted main-agent and user names", () => {
    expect(validateIdentityClaim({ claim: { subject: "main_agent", claimed_name: "마당쇠" }, mainAgentName: "마당쇠", userName: "사용자" })).toEqual({ ok: true })
    expect(validateIdentityClaim({ claim: { subject: "user", claimed_name: "사용자" }, mainAgentName: "마당쇠", userName: "사용자" })).toEqual({ ok: true })
  })

  it("rejects identity substitution and an unknown user name", () => {
    expect(validateIdentityClaim({ claim: { subject: "main_agent", claimed_name: "Knowbee" }, mainAgentName: "마당쇠", userName: "사용자" })).toEqual({ ok: false, reasonCode: "main_agent_name_mismatch" })
    expect(validateIdentityClaim({ claim: { subject: "user", claimed_name: "마당쇠" }, mainAgentName: "마당쇠", userName: "사용자" })).toEqual({ ok: false, reasonCode: "user_name_mismatch" })
    expect(validateIdentityClaim({ claim: { subject: "user", claimed_name: "마당쇠" }, mainAgentName: "마당쇠", userName: "" })).toEqual({ ok: false, reasonCode: "user_name_unset" })
  })

  it("does not apply identity validation to ordinary requests", () => {
    expect(validateIdentityClaim({ claim: { subject: "none", claimed_name: "" }, mainAgentName: "마당쇠", userName: "" })).toEqual({ ok: true })
  })
})
