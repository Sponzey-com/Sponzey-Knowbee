import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import {
  TEMPORARY_ARTIFACT_LIFECYCLES,
  evaluateTemporaryArtifactLifecycle,
} from "../packages/core/src/index.ts"

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith(".ts") && !path.endsWith(".d.ts") ? [path] : []
  })
}

describe("task1253 temporary artifact registry", () => {
  it("registers every deprecated or experimental core source with complete lifecycle metadata", () => {
    const lifecycleSources = new Set(
      TEMPORARY_ARTIFACT_LIFECYCLES.map((manifest) => manifest.artifactId.split("#")[0]),
    )
    const discovered = sourceFiles("packages/core/src")
      .filter((path) => /@deprecated|riskLevel:\s*"experimental"/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(".", path).replaceAll("\\", "/"))
      .sort()
    expect(discovered.filter((path) => !lifecycleSources.has(path))).toEqual([])
  })

  it("keeps registry IDs unique and every current lifecycle decision valid", () => {
    const ids = TEMPORARY_ARTIFACT_LIFECYCLES.map((manifest) => manifest.artifactId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(
      TEMPORARY_ARTIFACT_LIFECYCLES.map(
        (manifest) => evaluateTemporaryArtifactLifecycle(manifest).status,
      ),
    ).toEqual(TEMPORARY_ARTIFACT_LIFECYCLES.map(() => "active"))
  })
})
