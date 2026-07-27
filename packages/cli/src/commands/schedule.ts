export async function scheduleRunCommand(scheduleId: string): Promise<void> {
  const {
    bootstrapRuntime,
    captureRuntimePaths,
    createArtifactStorageContext,
    createMemoryJournalRepository,
    createAgentHierarchyStorage,
    startChannels,
    runScheduleAndWait,
    closeServer,
  } = await import("@knowbee/core")

  try {
    const config = await bootstrapRuntime()
    const paths = captureRuntimePaths()
    const memoryJournal = createMemoryJournalRepository(paths)
    await startChannels(config, paths)
    try {
      await runScheduleAndWait(
        scheduleId,
        "system crontab",
        config,
        createArtifactStorageContext(paths),
        memoryJournal,
        createAgentHierarchyStorage(paths),
      )
    } finally {
      memoryJournal.close()
    }
  } finally {
    await closeServer().catch(() => undefined)
  }
}
