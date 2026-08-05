import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const tempDirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
}

function machOArm64Fixture(): Buffer {
  const bytes = Buffer.alloc(32)
  bytes.writeUInt32LE(0xfeedfacf, 0)
  bytes.writeUInt32LE(0x0100000c, 4)
  return bytes
}

function elfX64Fixture(): Buffer {
  const bytes = Buffer.alloc(64)
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0)
  bytes.writeUInt16LE(62, 18)
  return bytes
}

function peX64Fixture(): Buffer {
  const bytes = Buffer.alloc(128)
  bytes.write("MZ", 0, "ascii")
  bytes.writeUInt32LE(64, 0x3c)
  bytes.write("PE\0\0", 64, "binary")
  bytes.writeUInt16LE(0x8664, 68)
  return bytes
}

function peArm64Fixture(): Buffer {
  const bytes = Buffer.alloc(128)
  bytes.write("MZ", 0, "ascii")
  bytes.writeUInt32LE(64, 0x3c)
  bytes.write("PE\0\0", 64, "binary")
  bytes.writeUInt16LE(0xaa64, 68)
  return bytes
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("npm install packaging", () => {
  it("defines a publishable Knowbee meta package with the knowbee binary", () => {
    const packageJson = readJson("packages/knowbee/package.json")

    expect(packageJson).toMatchObject({
      name: "@sponzey/knowbee",
      version: "0.1.0",
      type: "module",
    })
    expect(packageJson.private).not.toBe(true)
    expect(packageJson.bin).toEqual({ knowbee: "./bin/knowbee.js" })
    expect(packageJson.files).toEqual(expect.arrayContaining(["bin"]))
    expect(existsSync("packages/knowbee/bin/knowbee.js")).toBe(true)
  })

  it("keeps CLI, Core, and WebUI publishable for npm installation", () => {
    const cliPackage = readJson("packages/cli/package.json")
    const corePackage = readJson("packages/core/package.json")
    const webuiPackage = readJson("packages/webui/package.json")
    const cliSource = readFileSync("packages/cli/src/index.ts", "utf-8")

    expect(cliPackage.private).not.toBe(true)
    expect(cliPackage.files).toEqual(expect.arrayContaining(["dist"]))
    expect(corePackage.private).not.toBe(true)
    expect(corePackage.files).toEqual(expect.arrayContaining(["dist"]))
    expect(webuiPackage.private).not.toBe(true)
    expect(webuiPackage.files).toEqual(expect.arrayContaining(["dist"]))
    expect(cliSource).toContain('.command("start")')
  })

  it("stages the meta npm package with registry dependencies and Yeonjang optional packages", () => {
    const outputDir = makeTempDir("knowbee-npm-package-")
    execFileSync(
      "node",
      ["scripts/package-npm.mjs", "--version", "v9.8.7", "--output-dir", outputDir],
      {
        cwd: process.cwd(),
        stdio: "pipe",
      },
    )

    const staged = readJson(join(outputDir, "knowbee", "package.json"))
    expect(staged).toMatchObject({
      name: "@sponzey/knowbee",
      version: "9.8.7",
      bin: { knowbee: "./bin/knowbee.js" },
    })
    expect(staged.dependencies).toMatchObject({
      "@sponzey/cli": "9.8.7",
      "@sponzey/webui": "9.8.7",
    })
    expect(staged.optionalDependencies).toMatchObject({
      "@sponzey/yeonjang-darwin-arm64": "9.8.7",
      "@sponzey/yeonjang-linux-x64": "9.8.7",
      "@sponzey/yeonjang-win32-x64": "9.8.7",
    })
    expect(existsSync(join(outputDir, "knowbee", "bin", "knowbee.js"))).toBe(true)

    const core = readJson(join(outputDir, "core", "package.json"))
    const cli = readJson(join(outputDir, "cli", "package.json"))
    const webui = readJson(join(outputDir, "webui", "package.json"))
    expect(core.name).toBe("@sponzey/core")
    expect(core.exports).toHaveProperty("./serve")
    expect(cli).toMatchObject({
      name: "@sponzey/cli",
      version: "9.8.7",
      dependencies: {
        "@sponzey/core": "9.8.7",
      },
    })
    expect(webui.name).toBe("@sponzey/webui")
    expect(
      existsSync(
        join(outputDir, "core", "dist", "prompts", "work_order_template_prompt_text_user.md"),
      ),
    ).toBe(true)
    expect(existsSync(join(outputDir, "core", "dist", "prompts", "system.md"))).toBe(true)
    expect(readFileSync(join(outputDir, "cli", "dist", "index.js"), "utf-8")).toContain(
      "@sponzey/core",
    )
    expect(readFileSync(join(outputDir, "cli", "dist", "launcher.js"), "utf-8")).toContain(
      "@sponzey/core/serve",
    )
    expect(
      existsSync(join(outputDir, "core", "dist", "runtime", "serve-bundle.js")),
    ).toBe(true)
    expect(
      existsSync(join(outputDir, "core", "dist", "runtime", "serve-bundle.d.ts")),
    ).toBe(true)
    expect(
      existsSync(join(outputDir, "core", "dist", "runtime", "serve-bundle.manifest.json")),
    ).toBe(true)
    expect(readFileSync(join(outputDir, "knowbee", "bin", "knowbee.js"), "utf-8")).toContain(
      "@sponzey/cli",
    )
  })

  it("stages a compiled Yeonjang platform package from a built binary", async () => {
    const fixtureDir = makeTempDir("knowbee-yeonjang-fixture-")
    const outputDir = makeTempDir("knowbee-yeonjang-package-")
    const binaryPath = join(fixtureDir, "Yeonjang")
    const darwinBinary = machOArm64Fixture()
    writeFileSync(binaryPath, darwinBinary)

    execFileSync(
      "node",
      [
        "scripts/package-yeonjang-platform.mjs",
        "--target",
        "darwin-arm64",
        "--binary",
        binaryPath,
        "--version",
        "v9.8.7",
        "--output-dir",
        outputDir,
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    )

    const staged = readJson(join(outputDir, "yeonjang-darwin-arm64", "package.json"))
    expect(staged).toMatchObject({
      name: "@sponzey/yeonjang-darwin-arm64",
      version: "9.8.7",
      os: ["darwin"],
      cpu: ["arm64"],
    })
    expect(existsSync(join(outputDir, "yeonjang-darwin-arm64", "bin", "knowbee-yeonjang"))).toBe(
      true,
    )
    expect(existsSync(join(outputDir, "yeonjang-darwin-arm64", "index.js"))).toBe(true)
    const identity = readJson(
      join(outputDir, "yeonjang-darwin-arm64", "release-identity.json"),
    )
    expect(identity).toMatchObject({
      schemaId: "yeonjang.package-identity.v1",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      target: {
        key: "darwin-arm64",
        os: "darwin",
        cpu: "arm64",
      },
      binary: {
        name: "knowbee-yeonjang",
        sizeBytes: darwinBinary.length,
        sha256: `sha256:${createHash("sha256").update(darwinBinary).digest("hex")}`,
      },
    })
    const stagedIndex = join(outputDir, "yeonjang-darwin-arm64", "index.js")
    const stagedModule = await import(
      `${pathToFileURL(stagedIndex).href}?identity=${Date.now()}`
    )
    expect(stagedModule.verifyYeonjangPackageIdentity()).toEqual({
      outcome: "verified",
    })
    writeFileSync(
      join(outputDir, "yeonjang-darwin-arm64", "bin", "knowbee-yeonjang"),
      "tampered\n",
      "utf-8",
    )
    expect(stagedModule.verifyYeonjangPackageIdentity()).toEqual({
      outcome: "rejected",
      reason: "binary_identity_mismatch",
    })

    const linuxBinaryPath = join(fixtureDir, "knowbee-yeonjang-linux")
    writeFileSync(linuxBinaryPath, elfX64Fixture())
    execFileSync(
      "node",
      [
        "scripts/package-yeonjang-platform.mjs",
        "--target",
        "linux-x64",
        "--binary",
        linuxBinaryPath,
        "--output-dir",
        outputDir,
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    )

    const linux = readJson(join(outputDir, "yeonjang-linux-x64", "package.json"))
    expect(linux).toMatchObject({
      name: "@sponzey/yeonjang-linux-x64",
      os: ["linux"],
      cpu: ["x64"],
      libc: ["glibc"],
    })
  })

  it("rejects a binary whose executable target differs from the package target", () => {
    const fixtureDir = makeTempDir("knowbee-yeonjang-target-mismatch-")
    const outputDir = makeTempDir("knowbee-yeonjang-target-mismatch-package-")
    const binaryPath = join(fixtureDir, "knowbee-yeonjang")
    writeFileSync(binaryPath, machOArm64Fixture())

    expect(() =>
      execFileSync(
        "node",
        [
          "scripts/package-yeonjang-platform.mjs",
          "--target",
          "linux-x64",
          "--binary",
          binaryPath,
          "--output-dir",
          outputDir,
        ],
        { cwd: process.cwd(), stdio: "pipe" },
      ),
    ).toThrow()
    expect(existsSync(join(outputDir, "yeonjang-linux-x64", "release-identity.json"))).toBe(false)
  })

  it("finds a Windows Yeonjang binary from the build target directory", () => {
    const targetDir = makeTempDir("knowbee-yeonjang-windows-target-")
    const outputDir = makeTempDir("knowbee-yeonjang-windows-package-")
    const binaryPath = join(targetDir, "release", "knowbee-yeonjang.exe")
    mkdirSync(dirname(binaryPath), { recursive: true })
    writeFileSync(binaryPath, peX64Fixture())

    execFileSync(
      "node",
      [
        "scripts/package-yeonjang-platform.mjs",
        "--target",
        "win32-x64",
        "--binary",
        "Yeonjang/target/release/knowbee-yeonjang.exe",
        "--output-dir",
        outputDir,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          YEONJANG_TARGET_DIR: targetDir,
        },
        stdio: "pipe",
      },
    )

    const staged = readJson(join(outputDir, "yeonjang-win32-x64", "package.json"))
    expect(staged).toMatchObject({
      name: "@sponzey/yeonjang-win32-x64",
      os: ["win32"],
      cpu: ["x64"],
    })
    expect(existsSync(join(outputDir, "yeonjang-win32-x64", "bin", "knowbee-yeonjang.exe"))).toBe(
      true,
    )
  })

  it("stages a native Windows ARM64 Yeonjang package with exact PE identity", () => {
    const targetDir = makeTempDir("knowbee-yeonjang-windows-arm64-target-")
    const outputDir = makeTempDir("knowbee-yeonjang-windows-arm64-package-")
    const binaryPath = join(targetDir, "release", "knowbee-yeonjang.exe")
    mkdirSync(dirname(binaryPath), { recursive: true })
    writeFileSync(binaryPath, peArm64Fixture())

    execFileSync(
      "node",
      [
        "scripts/package-yeonjang-platform.mjs",
        "--target",
        "win32-arm64",
        "--binary",
        binaryPath,
        "--output-dir",
        outputDir,
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    )

    const staged = readJson(join(outputDir, "yeonjang-win32-arm64", "package.json"))
    const identity = readJson(join(outputDir, "yeonjang-win32-arm64", "release-identity.json"))
    expect(staged).toMatchObject({
      name: "@sponzey/yeonjang-win32-arm64",
      os: ["win32"],
      cpu: ["arm64"],
    })
    expect(identity).toMatchObject({
      target: { key: "win32-arm64", os: "win32", cpu: "arm64" },
      binary: { format: "pe_32_plus", targetKey: "win32-arm64" },
    })
  })

  it("documents the GitHub Actions release path for npm package publishing", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf-8")

    expect(workflow).toContain("scripts/package-npm.mjs")
    expect(workflow).toContain("scripts/package-yeonjang-platform.mjs")
    expect(workflow).toContain('--version "$GITHUB_REF_NAME"')
    expect(workflow).toContain("macos-latest")
    expect(workflow).toContain("build-yeonjang-linux-package:")
    expect(workflow).toContain("image: ubuntu:20.04")
    expect(workflow).toMatch(/build-yeonjang-linux-package:[\s\S]*runs-on: ubuntu-latest/u)
    expect(workflow).toMatch(
      /build-yeonjang-linux-package:[\s\S]*bash scripts\/build-yeonjang-linux\.sh/u,
    )
    expect(workflow).toContain("windows-latest")
    expect(workflow).toContain("github-release:")
    expect(workflow).toMatch(/github-release:[\s\S]*contents: write/u)
    expect(workflow).toContain("GH_REPO: ${{ github.repository }}")
    expect(workflow).toContain("gh release create")
    expect(workflow).toContain("gh release upload")
    expect(workflow).toContain('npm view "$package_spec" version')
    expect(workflow).toContain("Skipping already published package")
    expect(workflow).toContain("NODE_AUTH_TOKEN")
  })
})
