import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { RuntimePaths } from "@knowbee/core"

const SAMPLE_CONFIG = `// 스폰지 노비 · Sponzey Knowbee configuration
// Docs: see design/plan.md
{
  ai: {
    connection: {
      provider: "",
      model: "",
    },
  },
  security: {
    // Directories the agent is allowed to access.
    // Empty = home directory only.
    allowedPaths: [],
    // "on-miss" = ask when a command isn't in allowedCommands
    // "always"  = always ask before shell_exec / file_delete
    // "off"     = never ask (dangerous)
    approvalMode: "on-miss",
    approvalTimeout: 60,
    approvalTimeoutFallback: "deny",
    allowedCommands: [],
  },
  orchestration: {
    maxDelegationTurns: 0,
  },
  webui: {
    enabled: true,
    port: 18888,
    host: "127.0.0.1",
    auth: {
      enabled: false,
    },
  },
  scheduler: {
    enabled: true,
    timezone: "Asia/Seoul",
  },
  search: {},
  memory: {
    sessionRetentionDays: 30,
  },
}
`

export function initConfig(paths: Pick<RuntimePaths, "configFile">) {
  const configPath = paths.configFile
  if (existsSync(configPath)) {
    console.log(`Config already exists: ${configPath}`)
    return
  }
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, SAMPLE_CONFIG, "utf-8")
  console.log(`Config created: ${configPath}`)
  console.log("Edit the file to add your API keys, then run: knowbee run \"hello\"")
}

export async function generateAuthToken(paths: Pick<RuntimePaths, "configFile">): Promise<void> {
  const { generateAuthToken: gen } = await import("@knowbee/core")
  const { token } = gen(paths)

  console.log("WebUI auth token generated and saved to config.")
  console.log(`Token: ${token}`)
  console.log("")
  console.log("Use this token as a Bearer token when accessing the API from outside localhost.")
  console.log("Localhost connections bypass auth automatically.")
}
