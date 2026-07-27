import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  buildCleanMachineInstallChecklist,
  buildReleaseManifest,
  buildReleasePipelinePlan,
} from "../packages/core/src/release/package.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

describe("task103 artifact cleanup release gate", () => {
  it("wires artifact cleanup CLI smoke into release pipeline and checklist", () => {
    const pipeline = buildReleasePipelinePlan({ targetPlatforms: [] })
    const cleanupStep = pipeline.steps.find((step) => step.id === "artifact-cleanup-cli-smoke")

    expect(cleanupStep).toEqual(
      expect.objectContaining({
        title: "Artifact cleanup CLI smoke",
        command: ["pnpm", "run", "smoke:artifact-cleanup-cli"],
        required: true,
        smoke: true,
      }),
    )
    expect(cleanupStep?.description).toContain("preview")
    expect(cleanupStep?.description).toContain("confirmation failure")
    expect(cleanupStep?.description).toContain("non-destructive")
    expect(cleanupStep?.description).not.toContain("--destructive-fixture")

    const checklist = buildCleanMachineInstallChecklist()
    expect(checklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "artifact-cleanup-cli-smoke",
          required: true,
          description: expect.stringContaining("non-destructive"),
        }),
      ]),
    )
  })

  it("includes artifact cleanup smoke in the release manifest without requiring destructive fixture smoke", () => {
    const runtimeFixture = createTestRuntimeConfigFixture({
      rootDir: mkdtempSync(join(tmpdir(), "knowbee-task103-")),
    })
    const manifest = buildReleaseManifest({
      rootDir: runtimeFixture.rootDir,
      releaseVersion: "v-task103",
      gitTag: "v-task103",
      gitCommit: "task103",
      targetPlatforms: [],
      now: new Date("2026-07-21T00:00:00.000Z"),
      config: runtimeFixture.config,
      runtimePaths: runtimeFixture.paths,
    })

    expect(manifest.pipeline.order).toContain("artifact-cleanup-cli-smoke")
    expect(
      manifest.cleanInstallChecklist.some(
        (item) => item.id === "artifact-cleanup-cli-smoke" && item.required,
      ),
    ).toBe(true)
    expect(JSON.stringify(manifest.pipeline)).not.toContain("--destructive-fixture")
    expect(JSON.stringify(manifest.cleanInstallChecklist)).not.toContain("--destructive-fixture")
  })
})
