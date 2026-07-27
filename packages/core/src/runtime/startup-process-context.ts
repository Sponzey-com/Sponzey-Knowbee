export type StartupEnvironment = Readonly<Record<string, string | undefined>>

export interface StartupProcessContext {
  readonly env: StartupEnvironment
  readonly argv: readonly string[]
  readonly cwd: string
  readonly platform?: string
}

export interface StartupProcessContextInput {
  env: Readonly<Record<string, string | undefined>>
  argv: readonly string[]
  cwd: string
  platform?: string
}

export function createStartupProcessContext(input: StartupProcessContextInput): StartupProcessContext {
  const cwd = input.cwd.trim()
  if (!cwd) throw new Error("startup_process_cwd_required")
  return Object.freeze({
    env: Object.freeze({ ...input.env }),
    argv: Object.freeze([...input.argv]),
    cwd,
    ...(input.platform?.trim() ? { platform: input.platform.trim() } : {}),
  })
}

export function captureStartupProcessContext(): StartupProcessContext {
  return createStartupProcessContext({
    env: process.env,
    argv: process.argv,
    cwd: process.cwd(),
    platform: process.platform,
  })
}
