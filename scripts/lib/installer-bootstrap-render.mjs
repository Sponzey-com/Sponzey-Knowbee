const SHA256 = /^[a-f0-9]{64}$/u
const POSIX_PLACEHOLDERS = Object.freeze({
  "darwin-arm64": "@@VERIFIER_SHA256_DARWIN_ARM64@@",
  "darwin-x64": "@@VERIFIER_SHA256_DARWIN_X64@@",
  "linux-x64": "@@VERIFIER_SHA256_LINUX_X64@@",
})

const POWERSHELL_PLACEHOLDERS = Object.freeze({
  "win32-arm64": "@@VERIFIER_SHA256_WIN32_ARM64@@",
  "win32-x64": "@@VERIFIER_SHA256_WIN32_X64@@",
})

export function renderPosixInstaller(input) {
  return renderInstallerTemplate(input, POSIX_PLACEHOLDERS)
}

export function renderPowerShellInstaller(input) {
  return renderInstallerTemplate(input, POWERSHELL_PLACEHOLDERS)
}

function renderInstallerTemplate(input, placeholders) {
  if (typeof input?.template !== "string" || input.template.length === 0) {
    throw new Error("installer_template_invalid")
  }
  let rendered = input.template
  for (const [target, placeholder] of Object.entries(placeholders)) {
    const digest = input.verifierSha256ByTarget?.[target]
    if (typeof digest !== "string" || !SHA256.test(digest)) {
      throw new Error(`installer_verifier_digest_invalid:${target}`)
    }
    rendered = rendered.replace(placeholder, digest)
  }
  if (/@@[A-Z0-9_]+@@/u.test(rendered)) {
    throw new Error("installer_template_unresolved")
  }
  return rendered
}
