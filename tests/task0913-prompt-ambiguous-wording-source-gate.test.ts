import { readdirSync, readFileSync } from "node:fs"
import { basename, join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const promptDir = join(process.cwd(), "prompts")
const allowedPolicyLine =
  '- Reject a diff that introduces unverifiable wording such as "appropriately", "as needed", "improve later", "if possible", "well", "enough", or "automatically decide".'

const bannedPhrases = [
  "appropriately",
  "as needed",
  "improve later",
  "if possible",
  "well",
  "enough",
  "automatically decide",
] as const

function promptFiles(): string[] {
  return readdirSync(promptDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => join(promptDir, entry))
}

describe("task0913 prompt ambiguous wording source gate", () => {
  it("keeps prompt sources free of known ambiguous wording outside the policy rejection rule", () => {
    const offenders: string[] = []

    for (const file of promptFiles()) {
      const promptId = basename(file)
      const lines = readFileSync(file, "utf-8").split(/\r?\n/u)
      lines.forEach((line, index) => {
        if (promptId === "prompt_improvement.md" && line === allowedPolicyLine) return

        const lowerLine = line.toLowerCase()
        for (const phrase of bannedPhrases) {
          const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
          const phrasePattern = new RegExp(`\\b${escaped}\\b`, "iu")
          if (phrasePattern.test(lowerLine)) {
            offenders.push(`${relative(process.cwd(), file)}:${index + 1} contains "${phrase}"`)
          }
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
