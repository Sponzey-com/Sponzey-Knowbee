import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readInstructionSkillSource } from "../packages/core/src/capabilities/instruction-skill-filesystem.ts"
import { loadInstructionSkillSnapshots } from "../packages/core/src/runs/instruction-skill-snapshot.ts"

let root = ""

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = ""
})

function createSkill(content: string | Uint8Array): string {
  root = mkdtempSync(join(tmpdir(), "knowbee-instruction-skill-"))
  const skillDir = join(root, "skill")
  mkdirSync(skillDir)
  writeFileSync(join(skillDir, "SKILL.md"), content)
  return realpathSync(resolve(skillDir))
}

describe("instruction Skill source adapter", () => {
  it("reads a canonical UTF-8 SKILL.md with a deterministic checksum", () => {
    const sourceRef = createSkill("# UI guidance\nKeep controls clear.\n")

    expect(readInstructionSkillSource({ sourceRef, maxBytes: 1024 })).toEqual({
      ok: true,
      content: "# UI guidance\nKeep controls clear.\n",
      checksum: "sha256:f5b73eb52f27012222d1946f6f35f16fd74b83010f43530d8c805c4d85bc9be8",
      byteLength: 35,
    })
  })

  it("rejects a changed source identity, oversized content, and invalid UTF-8", () => {
    root = mkdtempSync(join(tmpdir(), "knowbee-instruction-skill-"))
    const actual = join(root, "actual")
    mkdirSync(actual)
    writeFileSync(join(actual, "SKILL.md"), "# linked\n")
    const linked = join(root, "linked")
    symlinkSync(actual, linked)
    expect(readInstructionSkillSource({ sourceRef: linked, maxBytes: 1024 })).toEqual({
      ok: false,
      reasonCode: "instruction_source_identity_changed",
    })

    const oversized = join(root, "oversized")
    mkdirSync(oversized)
    writeFileSync(join(oversized, "SKILL.md"), "12345")
    expect(readInstructionSkillSource({ sourceRef: realpathSync(oversized), maxBytes: 4 })).toEqual(
      {
        ok: false,
        reasonCode: "instruction_source_too_large",
      },
    )

    const invalid = join(root, "invalid")
    mkdirSync(invalid)
    writeFileSync(join(invalid, "SKILL.md"), Uint8Array.from([0xff, 0xfe]))
    expect(
      readInstructionSkillSource({ sourceRef: realpathSync(invalid), maxBytes: 1024 }),
    ).toEqual({
      ok: false,
      reasonCode: "instruction_source_not_utf8",
    })
  })
})

describe("instruction Skill run snapshot", () => {
  it("freezes loaded content for the run even when the source changes later", () => {
    const sourceRef = createSkill("# First\n")
    const result = loadInstructionSkillSnapshots(
      {
        skills: [
          {
            capabilityId: "skill:ui",
            targetId: "agent:main",
            status: "enabled",
            risk: "safe",
            sourceRef,
          },
        ],
        maxSourceBytes: 1024,
        maxTotalBytes: 2048,
      },
      { readSource: readInstructionSkillSource },
    )

    writeFileSync(join(sourceRef, "SKILL.md"), "# Changed\n")
    expect(result).toMatchObject({
      snapshots: [
        {
          capabilityId: "skill:ui",
          targetId: "agent:main",
          risk: "safe",
          content: "# First\n",
        },
      ],
      findings: [],
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.snapshots)).toBe(true)
    expect(Object.isFrozen(result.snapshots[0])).toBe(true)
  })

  it("isolates adapter failures and enforces the aggregate byte budget", () => {
    const result = loadInstructionSkillSnapshots(
      {
        skills: [
          {
            capabilityId: "skill:first",
            targetId: "agent:main",
            status: "enabled",
            risk: "safe",
            sourceRef: "/first",
          },
          {
            capabilityId: "skill:second",
            targetId: "agent:main",
            status: "enabled",
            risk: "safe",
            sourceRef: "/second",
          },
          {
            capabilityId: "skill:disabled",
            targetId: "agent:main",
            status: "disabled",
            risk: "safe",
            sourceRef: "/disabled",
          },
        ],
        maxSourceBytes: 10,
        maxTotalBytes: 5,
      },
      {
        readSource: ({ sourceRef }) => {
          if (sourceRef === "/first") {
            return {
              ok: true,
              content: "1234",
              checksum: `sha256:${"a".repeat(64)}`,
              byteLength: 4,
            }
          }
          if (sourceRef === "/second") {
            return {
              ok: true,
              content: "5678",
              checksum: `sha256:${"b".repeat(64)}`,
              byteLength: 4,
            }
          }
          throw new Error("disabled Skill must not be read")
        },
      },
    )

    expect(result.snapshots.map((snapshot) => snapshot.capabilityId)).toEqual(["skill:first"])
    expect(result.findings).toEqual([
      {
        capabilityId: "skill:second",
        reasonCode: "instruction_snapshot_total_limit_exceeded",
      },
    ])
  })
})
