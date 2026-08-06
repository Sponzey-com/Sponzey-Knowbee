import { describe, expect, it } from "vitest"

import { buildInstallerPlatformBundlePlans } from "../scripts/lib/installer-bundle-plan.mjs"
import {
  INSTALLER_NODE_RUNTIME,
  INSTALLER_PLATFORM_PROFILES,
} from "../scripts/lib/installer-platforms.mjs"

const digest = (character: string) => character.repeat(64)

function nodeArchives() {
  return INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
    target: profile.target,
    fileName: profile.nodeRuntimeArchive,
    sizeBytes: 10_000 + index,
    sha256: profile.nodeRuntimeSha256,
  }))
}

function npmPackages() {
  return [
    {
      packageName: "@sponzey/knowbee",
      packageVersion: "9.8.7",
      fileName: "sponzey-knowbee-9.8.7.tgz",
      sizeBytes: 101,
      sha256: digest("a"),
    },
    {
      packageName: "@sponzey/core",
      packageVersion: "9.8.7",
      fileName: "sponzey-core-9.8.7.tgz",
      sizeBytes: 102,
      sha256: digest("b"),
    },
    {
      packageName: "@sponzey/webui",
      packageVersion: "9.8.7",
      fileName: "sponzey-webui-9.8.7.tgz",
      sizeBytes: 103,
      sha256: digest("c"),
    },
    {
      packageName: "@sponzey/cli",
      packageVersion: "9.8.7",
      fileName: "sponzey-cli-9.8.7.tgz",
      sizeBytes: 104,
      sha256: digest("d"),
    },
  ]
}

function yeonjangPackage(target = "win32-arm64") {
  return {
    target,
    packageName: `@sponzey/yeonjang-${target}`,
    packageVersion: "9.8.7",
    fileName: `sponzey-yeonjang-${target}-9.8.7.tgz`,
    sizeBytes: 201,
    sha256: digest("e"),
  }
}

describe("task004 installer bundle plan", () => {
  it("pins official Node archive SHA-256 for every packaging target", () => {
    expect(
      Object.fromEntries(
        INSTALLER_PLATFORM_PROFILES.map((profile) => [
          profile.nodeRuntimeArchive,
          profile.nodeRuntimeSha256,
        ]),
      ),
    ).toEqual({
      "node-v24.18.0-darwin-arm64.tar.gz":
        "e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1",
      "node-v24.18.0-darwin-x64.tar.gz":
        "dfd0dbd3e721503434df7b7205e719f61b3a3a31b2bcf9729b8b91fea240f080",
      "node-v24.18.0-linux-x64.tar.xz":
        "55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742",
      "node-v24.18.0-win-arm64.zip":
        "f274669adb93b1fd0fbf8f21fd078609e9dcc84333d4f2718d2dde3f9a161a01",
      "node-v24.18.0-win-x64.zip":
        "0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821",
    })
  })

  it("builds five deterministic plans with an always-present Knowbee body", () => {
    const built = buildInstallerPlatformBundlePlans({
      packageVersion: "9.8.7",
      nodeArchives: nodeArchives().reverse(),
      npmPackages: npmPackages().reverse(),
      yeonjangPackages: [],
    })

    expect(built.status).toBe("ready")
    if (built.status !== "ready") return
    expect(built.plans.map((plan) => plan.target)).toEqual(
      INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target),
    )
    expect(built.plans[0]).toMatchObject({
      kind: "knowbee.installer.bundle_plan",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      target: "darwin-arm64",
      outputName: "knowbee-9.8.7-darwin-arm64.tar.gz",
      node: INSTALLER_NODE_RUNTIME,
      yeonjang: { status: "absent" },
    })
    expect(built.plans[0]?.inputs.map((input) => input.id)).toEqual([
      "node",
      "npm:@sponzey/cli",
      "npm:@sponzey/core",
      "npm:@sponzey/knowbee",
      "npm:@sponzey/webui",
    ])
  })

  it("adds Yeonjang only to its exact target plan", () => {
    const built = buildInstallerPlatformBundlePlans({
      packageVersion: "9.8.7",
      nodeArchives: nodeArchives(),
      npmPackages: npmPackages(),
      yeonjangPackages: [yeonjangPackage()],
    })
    expect(built.status).toBe("ready")
    if (built.status !== "ready") return

    expect(built.plans.map((plan) => plan.yeonjang.status)).toEqual([
      "absent",
      "absent",
      "absent",
      "included",
      "absent",
    ])
    expect(built.plans[3]?.inputs.at(-1)).toMatchObject({
      id: "yeonjang:@sponzey/yeonjang-win32-arm64",
      fileName: "sponzey-yeonjang-win32-arm64-9.8.7.tgz",
    })
  })

  it.each([
    [
      "wrong Node digest",
      {
        nodeArchives: nodeArchives().map((item, index) =>
          index === 0 ? { ...item, sha256: digest("f") } : item,
        ),
        npmPackages: npmPackages(),
        yeonjangPackages: [],
      },
      "node_archive_digest_mismatch:darwin-arm64",
    ],
    [
      "missing npm body",
      { nodeArchives: nodeArchives(), npmPackages: npmPackages().slice(1), yeonjangPackages: [] },
      "npm_package_missing:@sponzey/knowbee",
    ],
    [
      "wrong npm version",
      {
        nodeArchives: nodeArchives(),
        npmPackages: npmPackages().map((item, index) =>
          index === 0 ? { ...item, packageVersion: "9.8.8" } : item,
        ),
        yeonjangPackages: [],
      },
      "npm_package_version_mismatch:@sponzey/knowbee",
    ],
    [
      "duplicate npm package",
      {
        nodeArchives: nodeArchives(),
        npmPackages: [...npmPackages(), npmPackages()[0]],
        yeonjangPackages: [],
      },
      "npm_package_duplicate:@sponzey/knowbee",
    ],
    [
      "wrong-target Yeonjang package",
      {
        nodeArchives: nodeArchives(),
        npmPackages: npmPackages(),
        yeonjangPackages: [
          { ...yeonjangPackage("win32-arm64"), packageName: "@sponzey/yeonjang-win32-x64" },
        ],
      },
      "yeonjang_package_target_mismatch:win32-arm64",
    ],
  ])("rejects $0 before archive assembly", (_name, values, reasonCode) => {
    expect(buildInstallerPlatformBundlePlans({ packageVersion: "9.8.7", ...values })).toEqual({
      status: "rejected",
      reasonCode,
    })
  })
})
