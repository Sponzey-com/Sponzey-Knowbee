import { mkdirSync, createWriteStream } from "node:fs"
import { join } from "node:path"
import { pipeline } from "node:stream/promises"
import type { Bot } from "grammy"
import type { ArtifactStorageContext } from "../../artifacts/lifecycle.js"
import { createLogger } from "../../logger/index.js"

const log = createLogger("channel:telegram:file-handler")

export class FileHandler {
  constructor(
    private bot: Bot,
    private storage: ArtifactStorageContext,
  ) {}

  async downloadFile(
    fileId: string,
    sessionId: string,
    filename: string,
  ): Promise<string> {
    const file = await this.bot.api.getFile(fileId)
    const filePath = file.file_path

    if (filePath === undefined) {
      throw new Error(`Telegram returned no file_path for file_id: ${fileId}`)
    }

    const token = (this.bot as unknown as { token: string }).token
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`

    const tmpDir = join(this.storage.rootDir, "..", "tmp", sessionId)
    mkdirSync(tmpDir, { recursive: true })

    const localPath = join(tmpDir, filename)

    log.info(`Downloading file from Telegram: ${url} → ${localPath}`)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download file: HTTP ${response.status}`)
    }
    if (response.body === null) {
      throw new Error("Response body is null")
    }

    const writeStream = createWriteStream(localPath)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await pipeline(response.body as unknown as NodeJS.ReadableStream, writeStream)

    return localPath
  }
}
