const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const REQUIRED_ENVIRONMENTS = Object.freeze([
  "installer-release-publish",
  "installer-stable-promotion",
])

function rejected(reasonCode) {
  return { status: "rejected", reasonCode }
}

function validInput(input) {
  return (
    typeof input?.repo === "string" &&
    REPO.test(input.repo) &&
    typeof input.releaseTag === "string" &&
    RELEASE_TAG.test(input.releaseTag) &&
    Array.isArray(input.environments) &&
    input.environments.every(
      (value) =>
        typeof value?.name === "string" &&
        Array.isArray(value.protectionRuleTypes) &&
        value.protectionRuleTypes.every((ruleType) => typeof ruleType === "string"),
    ) &&
    (input.release === undefined ||
      (typeof input.release?.tagName === "string" &&
        typeof input.release?.isPrerelease === "boolean"))
  )
}

export function assessInstallerReleaseReadiness(input) {
  if (!validInput(input)) return rejected("installer_release_readiness_input_invalid")
  const missing = []
  for (const environmentName of REQUIRED_ENVIRONMENTS) {
    const environment = input.environments.find((value) => value.name === environmentName)
    if (!environment) {
      missing.push(`environment:${environmentName}`)
    } else if (!environment.protectionRuleTypes.includes("required_reviewers")) {
      missing.push(`environment_protection:${environmentName}`)
    }
  }
  if (input.release?.tagName !== input.releaseTag || input.release?.isPrerelease !== true) {
    missing.push("prerelease:exact_tag")
  }
  return {
    kind: "knowbee.installer.release_readiness",
    schemaVersion: 1,
    status: missing.length === 0 ? "ready" : "blocked",
    repo: input.repo,
    releaseTag: input.releaseTag,
    cleanMachineRunner: "github_actions_hosted",
    missing,
  }
}
