const VERSION = /^(?:latest|v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u
const VALUE_OPTIONS = new Set(["--version", "--manifest", "--bundle-dir", "--locale"])
const BOOLEAN_OPTIONS = new Set([
  "--with-yeonjang",
  "--no-service",
  "--no-start",
  "--non-interactive",
  "--add-path",
  "--no-add-path",
  "--dry-run",
  "--json",
  "--no-browser",
  "--help",
])

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function safeValue(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !value.includes("\0") &&
    !value.includes("\r") &&
    !value.includes("\n")
  )
}

export function parseInstallerOptions(values) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string"))
    return reject("installer_options_invalid")
  const selected = new Map()
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index]
    if (!VALUE_OPTIONS.has(option) && !BOOLEAN_OPTIONS.has(option)) {
      return reject(`installer_option_unknown:${option}`)
    }
    if (selected.has(option)) return reject(`installer_option_duplicate:${option}`)
    if (VALUE_OPTIONS.has(option)) {
      const value = values[index + 1]
      if (!safeValue(value) || value.startsWith("--")) {
        return reject(`installer_option_value_missing:${option}`)
      }
      selected.set(option, value)
      index += 1
    } else {
      selected.set(option, true)
    }
  }

  if (selected.has("--help")) {
    return selected.size === 1 ? { status: "help" } : reject("installer_option_conflict:help")
  }
  if (selected.has("--no-service") && selected.has("--no-start"))
    return reject("installer_option_conflict:service")
  if (selected.has("--add-path") && selected.has("--no-add-path"))
    return reject("installer_option_conflict:add-path")

  const manifestPath = selected.get("--manifest")
  const bundleDirectory = selected.get("--bundle-dir")
  if (Boolean(manifestPath) !== Boolean(bundleDirectory))
    return reject("installer_offline_inputs_incomplete")
  const version = selected.get("--version") ?? "latest"
  if (!VERSION.test(version)) return reject("installer_version_invalid")
  const locale = selected.get("--locale") ?? "auto"
  if (locale !== "auto" && locale !== "en" && locale !== "ko")
    return reject("installer_locale_unsupported")
  if (selected.has("--json") && !selected.has("--dry-run") && !selected.has("--non-interactive"))
    return reject("installer_json_requires_non_interactive")

  const service = !selected.has("--no-service")
  return {
    status: "ready",
    version,
    withYeonjang: selected.has("--with-yeonjang"),
    service,
    start: service && !selected.has("--no-start"),
    addPath: !selected.has("--no-add-path"),
    browser: !selected.has("--no-browser"),
    nonInteractive: selected.has("--non-interactive"),
    dryRun: selected.has("--dry-run"),
    json: selected.has("--json"),
    offline: manifestPath ? { manifestPath, bundleDirectory } : null,
    locale,
  }
}
