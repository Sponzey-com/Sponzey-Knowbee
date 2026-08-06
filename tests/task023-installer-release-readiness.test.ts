import { describe, expect, it } from "vitest"

import { runInstallerReleaseReadinessCli } from "../scripts/lib/installer-release-readiness-cli.mjs"
import { assessInstallerReleaseReadiness } from "../scripts/lib/installer-release-readiness.mjs"

describe("task023 installer release readiness", () => {
  const input = {
    repo: "Sponzey-com/Sponzey-Knowbee",
    releaseTag: "v9.8.7-rc.1",
    environments: [
      { name: "installer-release-publish", protectionRuleTypes: ["required_reviewers"] },
      { name: "installer-stable-promotion", protectionRuleTypes: ["required_reviewers"] },
    ],
    release: { tagName: "v9.8.7-rc.1", isPrerelease: true },
  }

  it("admits only the exact prerelease after every external release boundary exists", () => {
    expect(assessInstallerReleaseReadiness(input)).toEqual({
      kind: "knowbee.installer.release_readiness",
      schemaVersion: 1,
      status: "ready",
      repo: input.repo,
      releaseTag: input.releaseTag,
      cleanMachineRunner: "github_actions_hosted",
      missing: [],
    })
  })

  it("fails closed for missing protected environments or a stable/wrong release", () => {
    expect(
      assessInstallerReleaseReadiness({
        ...input,
        environments: [],
        release: { tagName: "v9.8.7", isPrerelease: false },
      }),
    ).toEqual({
      kind: "knowbee.installer.release_readiness",
      schemaVersion: 1,
      status: "blocked",
      repo: input.repo,
      releaseTag: input.releaseTag,
      cleanMachineRunner: "github_actions_hosted",
      missing: [
        "environment:installer-release-publish",
        "environment:installer-stable-promotion",
        "prerelease:exact_tag",
      ],
    })
  })

  it("blocks a named environment that has no required reviewer protection", () => {
    expect(
      assessInstallerReleaseReadiness({
        ...input,
        environments: [
          input.environments[0],
          { name: "installer-stable-promotion", protectionRuleTypes: ["wait_timer"] },
        ],
      }),
    ).toEqual({
      kind: "knowbee.installer.release_readiness",
      schemaVersion: 1,
      status: "blocked",
      repo: input.repo,
      releaseTag: input.releaseTag,
      cleanMachineRunner: "github_actions_hosted",
      missing: ["environment_protection:installer-stable-promotion"],
    })
  })

  it("does not interpret failed or malformed GitHub queries as release-ready", async () => {
    expect(
      await runInstallerReleaseReadinessCli(
        ["--repo", "Sponzey-com/Sponzey-Knowbee", "--release-tag", "v9.8.7-rc.1"],
        async () => undefined,
      ),
    ).toEqual({ status: "blocked", reasonCode: "installer_release_readiness_query_failed" })

    expect(
      await runInstallerReleaseReadinessCli(
        ["--repo", "Sponzey-com/Sponzey-Knowbee", "--release-tag", "v9.8.7-rc.1"],
        async () => Promise.reject(new Error("network unavailable")),
      ),
    ).toEqual({ status: "blocked", reasonCode: "installer_release_readiness_query_failed" })

    expect(
      await runInstallerReleaseReadinessCli(
        ["--repo", "Sponzey-com/Sponzey-Knowbee", "--release-tag", "v9.8.7-rc.1"],
        async (request) => {
          if (request.kind === "environments") return { environments: [{}] }
          return undefined
        },
      ),
    ).toEqual({ status: "rejected", reasonCode: "installer_release_readiness_input_invalid" })

    expect(
      await runInstallerReleaseReadinessCli(
        ["--repo", "Sponzey-com/Sponzey-Knowbee", "--release-tag", "v9.8.7-rc.1"],
        async (request) => {
          if (request.kind === "environments") {
            return {
              environments: [
                { name: "installer-release-publish", protection_rules: [] },
                { name: "installer-stable-promotion", protection_rules: [] },
              ],
            }
          }
          return { tagName: "v9.8.7-rc.1", isPrerelease: true }
        },
      ),
    ).toMatchObject({
      status: "blocked",
      missing: [
        "environment_protection:installer-release-publish",
        "environment_protection:installer-stable-promotion",
      ],
    })
  })
})
