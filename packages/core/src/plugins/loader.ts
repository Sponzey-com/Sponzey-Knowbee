/**
 * PluginLoader — loads, initializes, and manages plugin lifecycle.
 */

import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { getDb } from "../db/index.js"
import { toolDispatcher } from "../tools/runtime-dispatcher.js"
import { createLogger, redactLogText } from "../logger/index.js"
import type { KnowbeeConfig } from "../config/types.js"
import type { KnowbeePlugin, PluginContext, PluginMeta } from "./types.js"
import type { AnyTool } from "../tools/types.js"

const log = createLogger("plugins")

interface PluginLoaderRuntimeOptions {
  config: KnowbeeConfig
}

function pluginLoaderErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export class PluginLoader {
  private loaded = new Map<string, { plugin: KnowbeePlugin; meta: PluginMeta }>()

  /** Load all enabled plugins from the DB */
  async loadAll(options: PluginLoaderRuntimeOptions): Promise<void> {
    const config = options.config
    const db = getDb()
    const rows = db
      .prepare<[], PluginMeta>("SELECT * FROM plugins WHERE enabled = 1")
      .all()

    for (const meta of rows) {
      await this.load(meta, { config }).catch((err: unknown) => {
        log.error(`Failed to load plugin "${meta.name}": ${pluginLoaderErrorMessage(err)}`)
      })
    }
    log.info(`Loaded ${this.loaded.size} plugin(s)`)
  }

  /** Load a single plugin by meta */
  async load(meta: PluginMeta, options: PluginLoaderRuntimeOptions): Promise<void> {
    if (this.loaded.has(meta.name)) return
    const config = options.config

    const entryPath = resolve(meta.entry_path)
    if (!existsSync(entryPath)) {
      throw new Error("Plugin entry not found.")
    }

    const mod = await import(entryPath) as { default?: KnowbeePlugin }
    const plugin = mod.default
    if (!plugin || typeof plugin.initialize !== "function") {
      throw new Error(`Plugin "${meta.name}" does not export a valid KnowbeePlugin as default`)
    }

    const ctx = this.buildContext(meta, config)
    await plugin.initialize(ctx)
    this.loaded.set(meta.name, { plugin, meta })
    log.info(`Plugin "${meta.name}" v${meta.version} loaded`)
  }

  /** Unload a single plugin by name */
  async unload(name: string): Promise<void> {
    const entry = this.loaded.get(name)
    if (!entry) return

    await entry.plugin.teardown?.()
    this.loaded.delete(name)
    log.info(`Plugin "${name}" unloaded`)
  }

  /** Enable a plugin in DB and load it */
  async enable(name: string, options: PluginLoaderRuntimeOptions): Promise<void> {
    const db = getDb()
    db.prepare("UPDATE plugins SET enabled = 1, updated_at = ? WHERE name = ?").run(Date.now(), name)
    const meta = db.prepare<[string], PluginMeta>("SELECT * FROM plugins WHERE name = ?").get(name)
    if (meta) await this.load(meta, options)
  }

  /** Disable a plugin in DB and unload it */
  async disable(name: string): Promise<void> {
    const db = getDb()
    db.prepare("UPDATE plugins SET enabled = 0, updated_at = ? WHERE name = ?").run(Date.now(), name)
    await this.unload(name)
  }

  /** Register a plugin into the DB */
  static register(opts: {
    name: string
    version: string
    description?: string
    entryPath: string
    config?: Record<string, unknown>
  }): PluginMeta {
    const db = getDb()
    const now = Date.now()
    const id = crypto.randomUUID()

    const existing = db
      .prepare<[string], PluginMeta>("SELECT * FROM plugins WHERE name = ?")
      .get(opts.name)

    if (existing) {
      db.prepare(
        "UPDATE plugins SET version = ?, description = ?, entry_path = ?, config = ?, updated_at = ? WHERE name = ?",
      ).run(opts.version, opts.description ?? null, opts.entryPath, JSON.stringify(opts.config ?? {}), now, opts.name)
      return db.prepare<[string], PluginMeta>("SELECT * FROM plugins WHERE name = ?").get(opts.name)!
    }

    db.prepare(
      `INSERT INTO plugins (id, name, version, description, entry_path, enabled, config, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(id, opts.name, opts.version, opts.description ?? null, opts.entryPath, JSON.stringify(opts.config ?? {}), now, now)

    return db.prepare<[string], PluginMeta>("SELECT * FROM plugins WHERE id = ?").get(id)!
  }

  /** Remove a plugin from the DB */
  static unregister(name: string): void {
    getDb().prepare("DELETE FROM plugins WHERE name = ?").run(name)
  }

  /** List all plugins from DB */
  static list(): PluginMeta[] {
    return getDb().prepare<[], PluginMeta>("SELECT * FROM plugins ORDER BY installed_at DESC").all()
  }

  getLoadedNames(): string[] {
    return Array.from(this.loaded.keys())
  }

  private buildContext(meta: PluginMeta, config: KnowbeeConfig): PluginContext {
    return {
      registerTools(tools: AnyTool[]) {
        toolDispatcher.registerAll(tools)
      },
      getConfig<T>(keyPath: string): T | undefined {
        const cfg = config as unknown as Record<string, unknown>
        const parts = keyPath.split(".")
        let cur: unknown = cfg
        for (const part of parts) {
          if (cur == null || typeof cur !== "object") return undefined
          cur = (cur as Record<string, unknown>)[part]
        }
        return cur as T
      },
      log(level, message) {
        log[level](`[plugin:${meta.name}] ${message}`)
      },
    }
  }
}

export const pluginLoader = new PluginLoader()
