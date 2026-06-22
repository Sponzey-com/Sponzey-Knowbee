import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const STATE_DIR = process.env["KNOWBEE_STATE_DIR"] ?? process.env["WIZBY_STATE_DIR"]
  ?? process.env["HOWIE_STATE_DIR"]
  ?? process.env["KNOWBEE_STATE_DIR"]
  ?? (existsSync(join(homedir(), ".knowbee")) ? join(homedir(), ".knowbee")
    : existsSync(join(homedir(), ".wizby")) ? join(homedir(), ".wizby")
      : existsSync(join(homedir(), ".howie")) ? join(homedir(), ".howie")
        : join(homedir(), ".knowbee"))
const PID_FILE = join(STATE_DIR, "daemon.pid")
const LOGS_DIR = join(STATE_DIR, "logs")
let rejectionGuardInstalled = false

function formatDaemonError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

function installDaemonRejectionGuard(): void {
  if (rejectionGuardInstalled) return
  rejectionGuardInstalled = true
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection in daemon; keeping process alive:", formatDaemonError(reason))
  })
}

export async function serveCommand(): Promise<void> {
  installDaemonRejectionGuard()

  // Write PID file for service stop support
  mkdirSync(LOGS_DIR, { recursive: true })
  writeFileSync(PID_FILE, String(process.pid), "utf-8")

  console.log(`스폰지 노우비 · Sponzey Knowbee daemon starting (PID=${process.pid})`)

  const { bootstrapAsync } = await import("@knowbee/core")

  // Bootstrap: load config, init DB, register tools, start WebUI + scheduler
  await bootstrapAsync()

  console.log("스폰지 노우비 · Sponzey Knowbee daemon running. Press Ctrl+C to stop.")

  // Keep alive
  process.on("SIGTERM", () => {
    console.log("SIGTERM received — shutting down")
    import("@knowbee/core").then(({ closeServer }) => {
      void closeServer().then(() => process.exit(0))
    })
  })

  process.on("SIGINT", () => {
    console.log("\nSIGINT received — shutting down")
    import("@knowbee/core").then(({ closeServer }) => {
      void closeServer().then(() => process.exit(0))
    })
  })
}
