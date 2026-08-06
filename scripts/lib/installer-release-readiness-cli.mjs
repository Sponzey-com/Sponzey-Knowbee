import { assessInstallerReleaseReadiness } from "./installer-release-readiness.mjs"

function parseArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 4 ||
    argv[0] !== "--repo" ||
    argv[2] !== "--release-tag" ||
    typeof argv[1] !== "string" ||
    typeof argv[3] !== "string"
  ) {
    return undefined
  }
  return { repo: argv[1], releaseTag: argv[3] }
}

export async function runInstallerReleaseReadinessCli(argv, query) {
  const parsed = parseArguments(argv)
  if (!parsed) {
    return { status: "rejected", reasonCode: "installer_release_readiness_arguments_invalid" }
  }
  if (typeof query !== "function") {
    return { status: "rejected", reasonCode: "installer_release_readiness_query_invalid" }
  }
  let environmentResponse
  let release
  try {
    ;[environmentResponse, release] = await Promise.all([
      query({ kind: "environments", repo: parsed.repo }),
      query({ kind: "release", repo: parsed.repo, releaseTag: parsed.releaseTag }),
    ])
  } catch {
    return { status: "blocked", reasonCode: "installer_release_readiness_query_failed" }
  }
  if (!environmentResponse) {
    return { status: "blocked", reasonCode: "installer_release_readiness_query_failed" }
  }
  return assessInstallerReleaseReadiness({
    ...parsed,
    environments: Array.isArray(environmentResponse.environments)
      ? environmentResponse.environments.map((value) => ({
          name: value?.name,
          protectionRuleTypes: Array.isArray(value?.protection_rules)
            ? value.protection_rules.map((rule) => rule?.type)
            : [],
        }))
      : [],
    release,
  })
}
