import { describe, expect, it } from "vitest"
import {
  userFacingTextSourceRequiresFinalResponseReview,
  type UserFacingTextSource,
} from "../packages/core/src/runs/loop-directive.ts"

describe("task0865 user-facing text source policy", () => {
  it.each([
    ["runtime_deterministic", true],
    ["mixed", true],
    ["llm_generated", true],
    ["llm_reviewed", false],
    ["user_supplied_literal", true],
  ] satisfies Array<[UserFacingTextSource, boolean]>)(
    "marks %s final_response review requirement as %s",
    (source, expected) => {
      expect(userFacingTextSourceRequiresFinalResponseReview(source)).toBe(expected)
    },
  )
})
