import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const contractPath = "packages/core/src/contracts/work-record.ts"
const promptPath = "prompts/work_record.md"

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf-8")
}

function extractUnionValues(contract: string, typeName: string): string[] {
  const escapedName = typeName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  const pattern = new RegExp(
    `export type ${escapedName}\\s*=([\\s\\S]*?)(?=\\nexport type |\\nexport interface )`,
    "u",
  )
  const match = contract.match(pattern)
  if (!match) throw new Error(`Missing union type: ${typeName}`)
  return [...match[1]!.matchAll(/"([^"]+)"/gu)].map((item) => item[1]!).sort()
}

function extractPromptEnumValues(prompt: string, enumName: string): string[] {
  const escapedName = enumName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  const pattern = new RegExp(`- \`${escapedName}\` values are ([^\\n]+)\\.`, "u")
  const match = prompt.match(pattern)
  if (!match) throw new Error(`Missing prompt enum line: ${enumName}`)
  return [...match[1]!.matchAll(/`([^`]+)`/gu)].map((item) => item[1]!).sort()
}

describe("task0910 work_record prompt enum contract parity", () => {
  it.each([
    "RecommendedAction",
    "ResultSufficiency",
    "WorkRecordSource",
    "WorkRecordStatus",
    "WorkStepActionType",
    "WorkStepStatus",
    "WorkStepResultStatus",
    "ChildWorkResultStatus",
    "RecoveryChangedDimension",
  ])("keeps %s values aligned between prompt and TypeScript contract", (typeName) => {
    const contract = readProjectFile(contractPath)
    const prompt = readProjectFile(promptPath)

    expect(extractPromptEnumValues(prompt, typeName)).toEqual(
      extractUnionValues(contract, typeName),
    )
  })
})
