import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task019 installer release workflow", () => {
  it("builds five native bundles and prepares an unsigned candidate", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf8")
    expect(workflow).toContain("prepare-installer-inputs:")
    expect(workflow).toContain("build-installer-bundles:")
    expect(workflow).toContain("prepare-installer-candidate:")
    for (const target of ["darwin-arm64", "darwin-x64", "linux-x64", "win32-arm64", "win32-x64"]) {
      expect(workflow).toContain(`installer_target: ${target}`)
    }
    expect(workflow).toContain("node scripts/prepare-installer-inputs.mjs")
    expect(workflow).toContain("--prerelease")
    expect(workflow).toContain("node scripts/build-installer-bundle.mjs")
    expect(workflow).toContain('unzip -q "$input_root/$NODE_ARCHIVE" -d release/node-extracted')
    expect(workflow).toContain(
      'find release/application/node_modules -type d \\( -name .bin -o -name test -o -name tests -o -name fixture -o -name fixtures \\) -prune -exec rm -rf {} +',
    )
    expect(workflow).toContain(
      "find release/application/node_modules -type f \\( -name '*.d.ts' -o -name '*.map' \\) -delete",
    )
    expect(workflow).toContain("container: ${{ matrix.container }}")
    expect(workflow).toContain("Install Linux native module build dependencies")
    expect(workflow).toContain("rockylinux/rockylinux:8.10")
    expect(workflow).toContain("python39")
    expect(workflow).toContain("npm_config_python: ${{ matrix.npm_config_python }}")
    expect(workflow).toContain("gcc-toolset-12-gcc-c++")
    expect(workflow).toContain("source /opt/rh/gcc-toolset-12/enable")
    expect(workflow).toContain("findutils")
    expect(workflow).toContain("rm -rf release/application/node_modules/selenium-webdriver/bin")
    expect(workflow).toContain("npm_config_arch: ${{ matrix.npm_config_arch }}")
    expect(workflow).toContain("LDFLAGS: ${{ matrix.native_ldflags }}")
    expect(workflow).toContain("better-sqlite3/build/Release/obj.target")
    expect(workflow).toContain("node scripts/compose-installer-release.mjs prepare")
    expect(workflow).not.toContain("mkdir -p release/candidate/prepared")
    expect(workflow).not.toMatch(/PRIVATE_KEY|SIGNING_PRIVATE/iu)
  })

  it("publishes unsigned installer assets only in the protected finalizer", () => {
    const workflow = readFileSync(".github/workflows/installer-release-finalize.yml", "utf8")
    expect(workflow).toContain("environment: installer-release-publish")
    expect(workflow).toContain("node scripts/compose-installer-release.mjs finalize")
    expect(workflow).toContain("--prerelease")
    expect(workflow).toContain("installer-release-gate.json")
    expect(workflow).not.toMatch(/PRIVATE_KEY|SIGNING_PRIVATE/iu)
    expect(workflow).not.toMatch(/(?:signature|public-key|signing-response)/iu)
    expect(workflow).not.toMatch(/--latest|make_latest/iu)
  })

  it("reports rehearsal asset-count gate failures without publishing partial assets", () => {
    const workflow = readFileSync(".github/workflows/installer-rehearsal-publish.yml", "utf8")
    expect(workflow).toContain("release/candidate/receipts/artifact-receipts.json")
    expect(workflow).toContain("release/candidate/receipts/verifier-receipts.json")
    expect(workflow).not.toContain("find release/candidate/bundles -type f")
    expect(workflow).toContain("Expected exactly five installer bundle assets")
    expect(workflow).toContain("Expected exactly five installer verifier assets")
  })

  it("never overwrites a stable release or publishes installer packages to npm", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf8")
    expect(workflow).toMatch(/github-release:\n\s+if: startsWith\(github\.ref, 'refs\/tags\/'\)/u)
    expect(workflow).toContain(
      'test "$(gh release view "$GITHUB_REF_NAME" --json isPrerelease --jq .isPrerelease)" = true',
    )
    expect(workflow).not.toMatch(/\n\s+publish:\n/u)
    expect(workflow).not.toContain("npm publish")
    expect(workflow).not.toContain("NPM_TOKEN")
  })
})
