import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { renderPosixInstaller } from "../scripts/lib/installer-bootstrap-render.mjs"

const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "knowbee-posix-bootstrap-"))
  temporaryDirectories.push(directory)
  return directory
}

function executable(path: string, source: string): void {
  writeFileSync(path, source, "utf8")
  chmodSync(path, 0o755)
}

function fixture() {
  const root = temporaryDirectory()
  const commands = join(root, "commands")
  const assets = join(root, "assets")
  mkdirSync(commands)
  mkdirSync(assets)
  const verifier = `#!/bin/sh
target=""
stage=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --target) target="$2"; shift 2 ;;
    --stage) stage="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ -n "$stage" ]; then
  mkdir -p "$stage/bin"
  {
    echo '#!/bin/sh'
    echo 'for argument do'
    echo '  echo "$argument"'
    echo 'done >"$HANDOFF_LOG"'
  } >"$stage/bin/knowbee"
  chmod 700 "$stage/bin/knowbee"
fi
printf '%s\\n' \\
  'manifest_sha256=sha256:${"2".repeat(64)}' \\
  'release_version=9.8.7' \\
  'node_version=24.18.0' \\
  'node_module_abi=137' \\
  "target=$target" \\
  'archive=tar.gz' \\
  "name=knowbee-9.8.7-$target.tar.gz" \\
  'size_bytes=1000' \\
  'sha256=${"a".repeat(64)}' \\
  'entrypoint=bin/knowbee'
if [ -n "$stage" ]; then printf '%s\\n' 'staged_entrypoint=bin/knowbee'; fi
`
  for (const target of ["darwin-arm64", "darwin-x64", "linux-x64"]) {
    writeFileSync(join(assets, `knowbee-installer-verify-${target}`), verifier, "utf8")
  }
  writeFileSync(join(assets, "installer-manifest.json"), "manifest\n")
  for (const target of ["darwin-arm64", "darwin-x64", "linux-x64"]) {
    writeFileSync(join(assets, `knowbee-9.8.7-${target}.tar.gz`), "unsigned archive\n")
  }

  executable(
    join(commands, "curl"),
    `#!/bin/sh
output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --proto|--proto-redir|--connect-timeout|--max-time|--max-filesize|--output|--write-out)
      if [ "$1" = "--output" ]; then output="$2"; fi
      shift 2
      ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
name=\${url##*/}
cp "$FIXTURE_ASSETS/$name" "$output" || exit 1
printf '%s\\n' "$url" >>"$CURL_LOG"
printf '%s' "$url"
`,
  )
  executable(
    join(commands, "uname"),
    `#!/bin/sh
case "$1" in
  -s) printf '%s\\n' "$FAKE_UNAME_S" ;;
  -m) printf '%s\\n' "$FAKE_UNAME_M" ;;
  -r) printf '%s\\n' "$FAKE_UNAME_R" ;;
  *) exit 1 ;;
esac
`,
  )
  executable(join(commands, "getconf"), "#!/bin/sh\nprintf 'glibc %s\\n' \"$FAKE_LIBC_VERSION\"\n")
  executable(join(commands, "sw_vers"), "#!/bin/sh\nprintf '%s\\n' '13.5.0'\n")
  executable(join(commands, "sysctl"), "#!/bin/sh\nprintf '%s\\n' '0'\n")

  const digest = createHash("sha256").update(verifier).digest("hex")
  const rendered = renderPosixInstaller({
    template: readFileSync("installer/install.sh", "utf8"),
    verifierSha256ByTarget: {
      "darwin-arm64": digest,
      "darwin-x64": digest,
      "linux-x64": digest,
    },
  })
  const installer = join(root, "install.sh")
  executable(installer, rendered)
  const curlLog = join(root, "curl.log")
  const handoffLog = join(root, "handoff.log")
  return { root, commands, assets, installer, curlLog, handoffLog, rendered }
}

function run(input: ReturnType<typeof fixture>, platform: { os: string; machine: string }) {
  return spawnSync("/bin/sh", [input.installer, "--non-interactive"], {
    encoding: "utf8",
    env: {
      PATH: `${input.commands}:/usr/bin:/bin:/usr/sbin:/sbin`,
      FIXTURE_ASSETS: input.assets,
      CURL_LOG: input.curlLog,
      HANDOFF_LOG: input.handoffLog,
      FAKE_UNAME_S: platform.os,
      FAKE_UNAME_M: platform.machine,
      FAKE_UNAME_R: "5.15.0",
      FAKE_LIBC_VERSION: "2.31",
    },
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task012 POSIX installer bootstrap", () => {
  it.each([
    ["Darwin", "arm64", "darwin-arm64"],
    ["Darwin", "x86_64", "darwin-x64"],
    ["Linux", "x86_64", "linux-x64"],
  ])("pins, downloads and verifies the %s/%s target", (os, machine, target) => {
    const input = fixture()
    const result = run(input, { os, machine })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`Knowbee bootstrap verified: target=${target} release=9.8.7`)
    const urls = readFileSync(input.curlLog, "utf8").trim().split("\n")
    expect(urls).toHaveLength(3)
    expect(urls.every((url) => url.startsWith("https://github.com/Sponzey-com/"))).toBe(true)
    expect(urls[1]).toContain(`knowbee-installer-verify-${target}`)
    expect(urls[2]).toContain(`knowbee-9.8.7-${target}.tar.gz`)
    expect(readFileSync(input.handoffLog, "utf8")).toContain("installer\napply\n")
    expect(input.rendered).not.toMatch(/@@[A-Z0-9_]+@@/u)
  })

  it("rejects an unsupported host before any download", () => {
    const input = fixture()
    const result = run(input, { os: "Linux", machine: "aarch64" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("host_target_unsupported")
    expect(() => readFileSync(input.curlLog, "utf8")).toThrow()
  })

  it("rejects glibc below 2.28 before any download", () => {
    const input = fixture()
    const result = spawnSync("/bin/sh", [input.installer, "--non-interactive"], {
      encoding: "utf8",
      env: {
        PATH: `${input.commands}:/usr/bin:/bin:/usr/sbin:/sbin`,
        FIXTURE_ASSETS: input.assets,
        CURL_LOG: input.curlLog,
        FAKE_UNAME_S: "Linux",
        FAKE_UNAME_M: "x86_64",
        FAKE_UNAME_R: "5.15.0",
        FAKE_LIBC_VERSION: "2.27",
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("host_libc_unsupported")
    expect(() => readFileSync(input.curlLog, "utf8")).toThrow()
  })

  it("keeps confirmation and transport fail-closed without eval or insecure URLs", () => {
    const template = readFileSync("installer/install.sh", "utf8")
    expect(template).toContain("unsigned_origin_unverified")
    expect(template.match(/Continue\? \[y\/N\]/gu)).toHaveLength(1)
    expect(template).toContain("interactive_confirmation_required")
    expect(template).toContain("--proto '=https'")
    expect(template).toContain("--proto-redir '=https'")
    expect(template).toContain("--max-filesize")
    expect(template).not.toContain("eval ")
    expect(template).not.toContain("http://")
  })

  it("refuses missing verifier digests and unresolved release placeholders", () => {
    const template = readFileSync("installer/install.sh", "utf8")
    expect(() =>
      renderPosixInstaller({
        template,
        verifierSha256ByTarget: { "darwin-arm64": "a".repeat(64) },
      }),
    ).toThrow("installer_verifier_digest_invalid:darwin-x64")
  })

  it("projects dry-run without confirmation, download, temporary install or handoff", () => {
    const input = fixture()
    const result = spawnSync("/bin/sh", [input.installer, "--dry-run", "--json"], {
      encoding: "utf8",
      env: {
        PATH: `${input.commands}:/usr/bin:/bin:/usr/sbin:/sbin`,
        FIXTURE_ASSETS: input.assets,
        CURL_LOG: input.curlLog,
        HANDOFF_LOG: input.handoffLog,
        FAKE_UNAME_S: "Linux",
        FAKE_UNAME_M: "x86_64",
        FAKE_UNAME_R: "5.15.0",
        FAKE_LIBC_VERSION: "2.31",
      },
    })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "dry_run",
      target: "linux-x64",
      offline: false,
      service: true,
      start: true,
    })
    expect(() => readFileSync(input.curlLog, "utf8")).toThrow()
    expect(() => readFileSync(input.handoffLog, "utf8")).toThrow()
  })

  it("installs from paired offline evidence without invoking curl", () => {
    const input = fixture()
    const result = spawnSync(
      "/bin/sh",
      [
        input.installer,
        "--non-interactive",
        "--manifest",
        join(input.assets, "installer-manifest.json"),
        "--bundle-dir",
        input.assets,
      ],
      {
        encoding: "utf8",
        env: {
          PATH: `${input.commands}:/usr/bin:/bin:/usr/sbin:/sbin`,
          FIXTURE_ASSETS: input.assets,
          CURL_LOG: input.curlLog,
          HANDOFF_LOG: input.handoffLog,
          FAKE_UNAME_S: "Linux",
          FAKE_UNAME_M: "x86_64",
          FAKE_UNAME_R: "5.15.0",
          FAKE_LIBC_VERSION: "2.31",
        },
      },
    )
    expect(result.status, result.stderr).toBe(0)
    expect(() => readFileSync(input.curlLog, "utf8")).toThrow()
    expect(readFileSync(input.handoffLog, "utf8")).toContain("installer\napply\n")
  })

  it("hands explicit effect options to the verified application entrypoint", () => {
    const input = fixture()
    const result = spawnSync(
      "/bin/sh",
      [
        input.installer,
        "--non-interactive",
        "--with-yeonjang",
        "--no-service",
        "--no-add-path",
        "--no-browser",
      ],
      {
        encoding: "utf8",
        env: {
          PATH: `${input.commands}:/usr/bin:/bin:/usr/sbin:/sbin`,
          FIXTURE_ASSETS: input.assets,
          CURL_LOG: input.curlLog,
          HANDOFF_LOG: input.handoffLog,
          FAKE_UNAME_S: "Linux",
          FAKE_UNAME_M: "x86_64",
          FAKE_UNAME_R: "5.15.0",
          FAKE_LIBC_VERSION: "2.31",
        },
      },
    )
    expect(result.status, result.stderr).toBe(0)
    const handoff = readFileSync(input.handoffLog, "utf8")
    expect(handoff).toContain("--with-yeonjang\n")
    expect(handoff).toContain("--no-service\n")
    expect(handoff).toContain("--no-add-path\n")
    expect(handoff).toContain("--no-browser\n")
  })

  it("rejects mutation JSON mode without non-interactive before any download", () => {
    const input = fixture()
    const result = spawnSync("/bin/sh", [input.installer, "--json"], {
      encoding: "utf8",
      env: {
        PATH: `${input.commands}:/usr/bin:/bin:/usr/sbin:/sbin`,
        CURL_LOG: input.curlLog,
        FAKE_UNAME_S: "Linux",
        FAKE_UNAME_M: "x86_64",
        FAKE_UNAME_R: "5.15.0",
        FAKE_LIBC_VERSION: "2.31",
      },
    })
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toEqual({
      status: "rejected",
      reasonCode: "installer_json_requires_non_interactive",
    })
    expect(() => readFileSync(input.curlLog, "utf8")).toThrow()
  })
})
