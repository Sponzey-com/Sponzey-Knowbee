import { describe, expect, it } from "vitest"

import {
  type InstallerHostSnapshot,
  parseUnsignedInstallerManifest,
  selectInstallerArtifact,
} from "../packages/core/src/release/installer-contract.js"

const digest = (character: string) => character.repeat(64)

function manifest() {
  return {
    kind: "knowbee.install.manifest",
    schemaVersion: 2,
    releaseVersion: "1.2.3",
    channel: "stable",
    node: { version: "24.7.0", moduleAbi: 137 },
    artifacts: [
      {
        target: "darwin-arm64",
        archive: "tar.gz",
        name: "knowbee-darwin-arm64.tar.gz",
        sizeBytes: 1_000,
        sha256: digest("a"),
        entrypoint: "bin/knowbee",
        nodeModuleAbi: 137,
      },
      {
        target: "darwin-x64",
        archive: "tar.gz",
        name: "knowbee-darwin-x64.tar.gz",
        sizeBytes: 1_001,
        sha256: digest("b"),
        entrypoint: "bin/knowbee",
        nodeModuleAbi: 137,
      },
      {
        target: "linux-x64",
        archive: "tar.gz",
        name: "knowbee-linux-x64.tar.gz",
        sizeBytes: 1_002,
        sha256: digest("c"),
        entrypoint: "bin/knowbee",
        nodeModuleAbi: 137,
        libc: "glibc",
      },
      {
        target: "win32-arm64",
        archive: "zip",
        name: "knowbee-win32-arm64.zip",
        sizeBytes: 1_003,
        sha256: digest("d"),
        entrypoint: "bin/knowbee.cmd",
        nodeModuleAbi: 137,
      },
      {
        target: "win32-x64",
        archive: "zip",
        name: "knowbee-win32-x64.zip",
        sizeBytes: 1_004,
        sha256: digest("e"),
        entrypoint: "bin/knowbee.cmd",
        nodeModuleAbi: 137,
      },
    ],
  }
}

const hosts: readonly InstallerHostSnapshot[] = [
  {
    os: "darwin",
    nativeArch: "arm64",
    processArch: "arm64",
    osVersion: "13.5.0",
  },
  {
    os: "darwin",
    nativeArch: "x64",
    processArch: "x64",
    osVersion: "14.6.1",
  },
  {
    os: "linux",
    nativeArch: "x64",
    processArch: "x64",
    kernelVersion: "4.18.0",
    libc: { family: "glibc", version: "2.28" },
    libstdcxxVersion: "3.4.25",
    session: { kind: "desktop", systemdUser: true, dbus: true },
  },
  {
    os: "win32",
    nativeArch: "arm64",
    processArch: "x64",
    osBuild: 22_000,
    powershell: { version: "5.1", languageMode: "FullLanguage" },
  },
  {
    os: "win32",
    nativeArch: "x64",
    processArch: "x64",
    osBuild: 26_100,
    powershell: { version: "7.4.6", languageMode: "FullLanguage" },
  },
]

describe("task001 installer manifest and host contract", () => {
  it("parses the closed unsigned v2 manifest and selects all five native targets", () => {
    const parsed = parseUnsignedInstallerManifest(manifest())
    expect(parsed.status).toBe("accepted")
    if (parsed.status !== "accepted") return

    expect(
      hosts.map((host) => {
        const selected = selectInstallerArtifact({ manifest: parsed.manifest, host })
        return selected.status === "ready" ? selected.target : selected.reasonCode
      }),
    ).toEqual(["darwin-arm64", "darwin-x64", "linux-x64", "win32-arm64", "win32-x64"])
  })

  it("uses native architecture rather than an emulated process architecture", () => {
    const parsed = parseUnsignedInstallerManifest(manifest())
    expect(parsed.status).toBe("accepted")
    if (parsed.status !== "accepted") return
    const emulatedWindowsHost = hosts[3]
    expect(emulatedWindowsHost).toBeDefined()
    if (!emulatedWindowsHost) return

    const selected = selectInstallerArtifact({
      manifest: parsed.manifest,
      host: emulatedWindowsHost,
    })
    expect(selected).toMatchObject({ status: "ready", target: "win32-arm64" })
  })

  it.each([
    ["unknown root field", { ...manifest(), injected: true }, "manifest_invalid"],
    [
      "unknown nested field",
      { ...manifest(), node: { ...manifest().node, injected: true } },
      "manifest_invalid",
    ],
    ["legacy signed schema", { ...manifest(), schemaVersion: 1 }, "schema_version_unsupported"],
    [
      "wrong Node major",
      { ...manifest(), node: { version: "22.17.0", moduleAbi: 127 } },
      "node_version_unsupported",
    ],
    [
      "ABI mismatch",
      {
        ...manifest(),
        artifacts: manifest().artifacts.map((artifact, index) =>
          index === 0 ? { ...artifact, nodeModuleAbi: 999 } : artifact,
        ),
      },
      "artifact_abi_mismatch:darwin-arm64",
    ],
    [
      "missing target",
      { ...manifest(), artifacts: manifest().artifacts.slice(1) },
      "artifact_target_missing:darwin-arm64",
    ],
    [
      "duplicate target",
      { ...manifest(), artifacts: [...manifest().artifacts, manifest().artifacts[0]] },
      "artifact_target_duplicate:darwin-arm64",
    ],
  ])("rejects $0 before asset selection", (_name, input, reasonCode) => {
    expect(parseUnsignedInstallerManifest(input)).toEqual({ status: "rejected", reasonCode })
  })

  it.each([
    [
      "old macOS",
      { os: "darwin", nativeArch: "arm64", processArch: "arm64", osVersion: "13.4.9" },
      "macos_version_unsupported",
    ],
    [
      "musl Linux",
      {
        os: "linux",
        nativeArch: "x64",
        processArch: "x64",
        kernelVersion: "6.6.0",
        libc: { family: "musl", version: "1.2.5" },
        libstdcxxVersion: "3.4.32",
        session: { kind: "desktop", systemdUser: true, dbus: true },
      },
      "linux_libc_unsupported",
    ],
    [
      "old glibc",
      {
        os: "linux",
        nativeArch: "x64",
        processArch: "x64",
        kernelVersion: "6.6.0",
        libc: { family: "glibc", version: "2.27" },
        libstdcxxVersion: "3.4.32",
        session: { kind: "desktop", systemdUser: true, dbus: true },
      },
      "linux_glibc_version_unsupported",
    ],
    [
      "no desktop session",
      {
        os: "linux",
        nativeArch: "x64",
        processArch: "x64",
        kernelVersion: "6.6.0",
        libc: { family: "glibc", version: "2.39" },
        libstdcxxVersion: "3.4.33",
        session: { kind: "headless", systemdUser: true, dbus: true },
      },
      "linux_desktop_session_required",
    ],
    [
      "Windows 10 build",
      {
        os: "win32",
        nativeArch: "x64",
        processArch: "x64",
        osBuild: 19_045,
        powershell: { version: "5.1", languageMode: "FullLanguage" },
      },
      "windows_version_unsupported",
    ],
    [
      "constrained PowerShell",
      {
        os: "win32",
        nativeArch: "x64",
        processArch: "x64",
        osBuild: 22_000,
        powershell: { version: "7.4.6", languageMode: "ConstrainedLanguage" },
      },
      "powershell_language_mode_unsupported",
    ],
  ])("blocks $0 with an explicit preflight reason", (_name, host, reasonCode) => {
    const parsed = parseUnsignedInstallerManifest(manifest())
    expect(parsed.status).toBe("accepted")
    if (parsed.status !== "accepted") return

    expect(
      selectInstallerArtifact({
        manifest: parsed.manifest,
        host: host as InstallerHostSnapshot,
      }),
    ).toEqual({ status: "blocked", reasonCode })
  })
})
