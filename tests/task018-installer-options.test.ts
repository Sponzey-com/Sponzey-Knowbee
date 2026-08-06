import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { selectOptionalYeonjang } from "../installer/application/optional-components.mjs"
import { completeInstallerPolicyTransaction } from "../installer/application/posix-service.mjs"
import {
  reduceInstallerTransaction,
  startInstallerTransaction,
} from "../packages/core/src/release/installer-transaction.js"
import { parseInstallerOptions } from "../scripts/lib/installer-options.mjs"

function activatedState() {
  let state = startInstallerTransaction({
    operationId: "installer:task018",
    idempotencyKey: "candidate:task018",
    targetFingerprint: `sha256:${"a".repeat(64)}`,
    desiredVersion: "9.8.7",
  })
  for (const type of [
    "preflight_passed",
    "bundle_downloaded",
    "bundle_verified",
    "stage_prepared",
    "activation_completed",
  ] as const) {
    const reduced = reduceInstallerTransaction(state, {
      type,
      eventId: `task018:${state.revision + 1}`,
      operationId: state.operationId,
      targetFingerprint: state.targetFingerprint,
      expectedRevision: state.revision,
      receiptRef: `receipt:${type}`,
      ...(type === "activation_completed" ? { previousReleaseId: null } : {}),
    })
    if (reduced.status !== "applied") throw new Error(reduced.reasonCode)
    state = reduced.state
  }
  return state
}

describe("task018 installer options", () => {
  it("preserves the one-shot standard profile with no arguments", () => {
    expect(parseInstallerOptions([])).toEqual({
      status: "ready",
      version: "latest",
      withYeonjang: false,
      service: true,
      start: true,
      addPath: true,
      browser: true,
      nonInteractive: false,
      dryRun: false,
      json: false,
      offline: null,
      locale: "auto",
    })
  })

  it("parses explicit automation and paired offline inputs without changing their paths", () => {
    expect(
      parseInstallerOptions([
        "--version",
        "9.8.7",
        "--with-yeonjang",
        "--no-service",
        "--non-interactive",
        "--no-add-path",
        "--dry-run",
        "--json",
        "--manifest",
        "/Volumes/Release Set/install-manifest.json",
        "--bundle-dir",
        "/Volumes/Release Set/assets",
        "--no-browser",
        "--locale",
        "ko",
      ]),
    ).toEqual({
      status: "ready",
      version: "9.8.7",
      withYeonjang: true,
      service: false,
      start: false,
      addPath: false,
      browser: false,
      nonInteractive: true,
      dryRun: true,
      json: true,
      offline: {
        manifestPath: "/Volumes/Release Set/install-manifest.json",
        bundleDirectory: "/Volumes/Release Set/assets",
      },
      locale: "ko",
    })
  })

  it.each([
    [["--unknown"], "installer_option_unknown:--unknown"],
    [["--version"], "installer_option_value_missing:--version"],
    [["--version", "9.8.7", "--version", "9.8.8"], "installer_option_duplicate:--version"],
    [["--manifest", "/tmp/manifest"], "installer_offline_inputs_incomplete"],
    [["--bundle-dir", "/tmp/assets"], "installer_offline_inputs_incomplete"],
    [["--no-service", "--no-start"], "installer_option_conflict:service"],
    [["--add-path", "--no-add-path"], "installer_option_conflict:add-path"],
    [["--locale", "fr"], "installer_locale_unsupported"],
    [["--json"], "installer_json_requires_non_interactive"],
    [["--help", "--dry-run"], "installer_option_conflict:help"],
  ])("rejects invalid or mixed options before projection: %j", (values, reasonCode) => {
    expect(parseInstallerOptions(values as string[])).toEqual({ status: "rejected", reasonCode })
  })

  it("keeps POSIX and PowerShell public option spellings in parity", () => {
    const posix = readFileSync("installer/install.sh", "utf8")
    const powershell = readFileSync("installer/install.ps1", "utf8")
    for (const option of [
      "--version",
      "--with-yeonjang",
      "--no-service",
      "--no-start",
      "--non-interactive",
      "--add-path",
      "--no-add-path",
      "--dry-run",
      "--json",
      "--manifest",
      "--bundle-dir",
      "--no-browser",
      "--locale",
      "--help",
    ]) {
      expect(posix, option).toContain(option)
      expect(powershell, option).toContain(option)
    }
  })

  it("commits no-service through explicit policy evidence without service or health calls", async () => {
    const saved: unknown[] = []
    const result = await completeInstallerPolicyTransaction({
      mode: "no-service",
      state: activatedState(),
      store: {
        async save(value: unknown) {
          saved.push(value)
          return { status: "saved" }
        },
      },
      releaseVersion: "9.8.7",
      stateDirectory: "/Users/bee/.knowbee",
      async rollback() {
        return { status: "rolled_back" }
      },
    })
    expect(result).toMatchObject({
      status: "committed",
      state: { phase: "committed", revision: 8 },
    })
    expect(saved).toHaveLength(3)
  })

  it("registers but does not start for no-start and commits a health policy receipt", async () => {
    const definition = { status: "ready", command: ["/opt/knowbee", "serve"] }
    const stateDirectory = "/Users/bee/.knowbee"
    const result = await completeInstallerPolicyTransaction({
      mode: "no-start",
      state: activatedState(),
      store: {
        async save() {
          return { status: "saved" }
        },
      },
      releaseVersion: "9.8.7",
      stateDirectory,
      definition,
      service: {
        async register(_definition: unknown, options: unknown) {
          expect(options).toEqual({ start: false })
          return { status: "registered" }
        },
        async inspect() {
          return {
            status: "registered",
            command: definition.command,
            stateDirectoryFingerprint: `sha256:${createHash("sha256").update(stateDirectory).digest("hex")}`,
          }
        },
      },
      isExactRegisteredInspection(value: { status: string; command: string[] }) {
        return (
          value.status === "registered" &&
          value.command.join("\0") === definition.command.join("\0")
        )
      },
      async rollback() {
        return { status: "rolled_back" }
      },
    })
    expect(result).toMatchObject({
      status: "committed",
      state: { phase: "committed", revision: 8 },
    })
  })

  it("keeps Yeonjang disabled by default and requires an exact-target verified inventory when selected", () => {
    const inventory = {
      kind: "knowbee.installer.bundle_inventory",
      schemaVersion: 1,
      target: "linux-x64",
      yeonjang: {
        status: "included",
        target: "linux-x64",
        packageName: "@sponzey/yeonjang-linux-x64",
      },
    }
    expect(selectOptionalYeonjang({ selected: false, target: "linux-x64", inventory })).toEqual({
      status: "disabled",
    })
    expect(selectOptionalYeonjang({ selected: true, target: "linux-x64", inventory })).toEqual({
      status: "ready",
      packageName: "@sponzey/yeonjang-linux-x64",
      permissionAction: "none",
      launchAction: "deferred_until_initialized",
    })
    expect(selectOptionalYeonjang({ selected: true, target: "win32-x64", inventory })).toEqual({
      status: "blocked",
      reasonCode: "installer_yeonjang_target_mismatch",
    })
    expect(
      selectOptionalYeonjang({
        selected: true,
        target: "linux-x64",
        inventory: { ...inventory, yeonjang: { status: "absent" } },
      }),
    ).toEqual({ status: "blocked", reasonCode: "installer_yeonjang_not_verified" })
  })
})
