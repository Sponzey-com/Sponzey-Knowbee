import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { getCliStateDir } from "../runtime-env.js"
import { formatDaemonRejectionLog } from "../daemon-error.js"

const STATE_DIR = getCliStateDir()
const PID_FILE = join(STATE_DIR, "daemon.pid")
const LOGS_DIR = join(STATE_DIR, "logs")
const STARTUP_EVIDENCE_FILE = join(STATE_DIR, "gateway-startup.json")
let rejectionGuardInstalled = false

function installDaemonRejectionGuard(): void {
  if (rejectionGuardInstalled) return
  rejectionGuardInstalled = true
  process.on("unhandledRejection", (reason) => {
    console.error(formatDaemonRejectionLog(reason))
  })
}

export async function serveCommand(): Promise<void> {
  installDaemonRejectionGuard()

  // Write PID file for service stop support
  mkdirSync(LOGS_DIR, { recursive: true })
  writeFileSync(PID_FILE, String(process.pid), "utf-8")

  console.log(`스폰지 노비 · Sponzey Knowbee daemon starting (PID=${process.pid})`)

  const {
    createGatewayStartupLogPort,
    createStartupEvidenceFilePort,
    startGatewayStartup,
  } = await import("@knowbee/core/startup")
  const startedAt = Date.now()
  const startup = await startGatewayStartup({
    startupId: `gateway-${process.pid}-${startedAt}`,
    pid: process.pid,
    startedAt,
    evidencePort: createStartupEvidenceFilePort({
      filePath: STARTUP_EVIDENCE_FILE,
    }),
    logger: createGatewayStartupLogPort(),
  })
  if (startup.status === "rejected") {
    throw new Error(`gateway_startup_rejected:${startup.reasonCode}`)
  }

  const { bootstrapAsync } = await import("@knowbee/core/bootstrap")

  // Bootstrap: load config, init DB, register tools, start WebUI + scheduler
  await bootstrapAsync(undefined, { startupProgress: startup.progress })

  console.log("스폰지 노비 · Sponzey Knowbee daemon running. Press Ctrl+C to stop.")

  // Keep alive
  process.on("SIGTERM", () => {
    console.log("SIGTERM received — shutting down")
    import("@knowbee/core/bootstrap").then(({ closeServer }) => {
      void closeServer().then(() => process.exit(0))
    })
  })

  process.on("SIGINT", () => {
    console.log("\nSIGINT received — shutting down")
    import("@knowbee/core/bootstrap").then(({ closeServer }) => {
      void closeServer().then(() => process.exit(0))
    })
  })
}
