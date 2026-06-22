export async function scheduleRunCommand(scheduleId: string): Promise<void> {
  const { bootstrapRuntime, startChannels, runScheduleAndWait, closeServer } = await import("@knowbee/core")

  try {
    await bootstrapRuntime()
    await startChannels()
    await runScheduleAndWait(scheduleId, "system crontab")
  } finally {
    await closeServer().catch(() => undefined)
  }
}
