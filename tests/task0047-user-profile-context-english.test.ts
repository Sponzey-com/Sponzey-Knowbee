import { describe, expect, it } from "vitest"

const { buildUserProfilePromptContext } = await import("../packages/core/src/agent/profile-context.ts")
const userProfile = {
  displayName: "마스터",
  profileName: "마당쇠",
  language: "ko",
  timezone: "Asia/Seoul",
  workspace: "/Users/dongwooshin",
}

describe("task0047 user profile prompt context English normalization", () => {
  it("keeps user values but renders profile context labels in English", () => {
    const context = buildUserProfilePromptContext(userProfile)

    expect(context).toContain("[User Profile]")
    expect(context).toContain("The following values come from the user's setup profile.")
    expect(context).toContain("- userName: 마스터")
    expect(context).not.toContain("- displayName:")
    expect(context).not.toContain("- profileName:")
    expect(context).toContain("- defaultLanguage: ko")
    expect(context).toContain("- defaultTimezone: Asia/Seoul")
    expect(context).toContain("- defaultWorkspace: /Users/dongwooshin")
    expect(context).not.toContain("[사용자 기본정보]")
    expect(context).not.toContain("표시 이름")
    expect(context).not.toContain("기본 언어")
  })
})
