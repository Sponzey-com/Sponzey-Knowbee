import { authMiddleware } from "../middleware/auth.js";
import { PluginLoader, pluginLoader } from "../../plugins/loader.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { redactUiValue } from "../../ui/redaction.js";
import { getApiRuntimeConfig } from "../runtime-context.js";
const INTERNAL_PATH_REDACTION = "[internal-path-redacted]";
function parsePluginConfig(config) {
    if (!config)
        return {};
    if (typeof config !== "string")
        return config;
    try {
        return JSON.parse(config);
    }
    catch {
        return {};
    }
}
function redactPluginConfigForRoute(config) {
    return redactUiValue(config, { audience: "advanced" }).value;
}
function projectPluginForRoute(plugin, isLoaded) {
    const config = parsePluginConfig(plugin.config);
    return {
        ...plugin,
        entry_path: INTERNAL_PATH_REDACTION,
        config: redactPluginConfigForRoute(config),
        is_loaded: isLoaded,
    };
}
export function registerPluginsRoute(app) {
    // GET /api/plugins — list all plugins
    app.get("/api/plugins", { preHandler: authMiddleware }, async () => {
        const plugins = PluginLoader.list();
        const loaded = new Set(pluginLoader.getLoadedNames());
        return plugins.map((p) => projectPluginForRoute(p, loaded.has(p.name)));
    });
    // GET /api/plugins/:name — single plugin details
    app.get("/api/plugins/:name", { preHandler: authMiddleware }, async (req, reply) => {
        const all = PluginLoader.list();
        const plugin = all.find((p) => p.name === req.params.name);
        if (!plugin)
            return reply.code(404).send({ error: "Plugin not found" });
        const loaded = pluginLoader.getLoadedNames().includes(plugin.name);
        return projectPluginForRoute(plugin, loaded);
    });
    // POST /api/plugins — register/install a plugin
    app.post("/api/plugins", { preHandler: authMiddleware }, async (req, reply) => {
        const { name, version, description, entryPath, config } = req.body;
        if (!name || !version || !entryPath) {
            return reply.code(400).send({ error: "name, version, entryPath required" });
        }
        const absPath = resolve(entryPath);
        if (!existsSync(absPath)) {
            return reply.code(400).send({ error: "Entry path does not exist." });
        }
        const meta = PluginLoader.register({
            name,
            version,
            ...(description !== undefined && { description }),
            entryPath: absPath,
            ...(config !== undefined && { config }),
        });
        return projectPluginForRoute(meta, pluginLoader.getLoadedNames().includes(meta.name));
    });
    // PATCH /api/plugins/:name — enable/disable or update config
    app.patch("/api/plugins/:name", { preHandler: authMiddleware }, async (req, reply) => {
        const { name } = req.params;
        const { enabled, config } = req.body;
        const db = (await import("../../db/index.js")).getDb();
        const existing = db.prepare("SELECT id FROM plugins WHERE name = ?").get(name);
        if (!existing)
            return reply.code(404).send({ error: "Plugin not found" });
        try {
            if (enabled === true) {
                const config = getApiRuntimeConfig(req);
                await pluginLoader.enable(name, { config });
            }
            else if (enabled === false) {
                await pluginLoader.disable(name);
            }
        }
        catch {
            return reply.code(400).send({ error: "Plugin could not be enabled." });
        }
        if (config !== undefined) {
            db.prepare("UPDATE plugins SET config = ?, updated_at = ? WHERE name = ?").run(JSON.stringify(config), Date.now(), name);
        }
        const updated = PluginLoader.list().find((p) => p.name === name);
        if (!updated)
            return reply.code(404).send({ error: "Plugin not found" });
        return projectPluginForRoute(updated, pluginLoader.getLoadedNames().includes(updated.name));
    });
    // DELETE /api/plugins/:name — uninstall a plugin
    app.delete("/api/plugins/:name", { preHandler: authMiddleware }, async (req, reply) => {
        const { name } = req.params;
        await pluginLoader.unload(name);
        PluginLoader.unregister(name);
        return reply.code(204).send();
    });
}
//# sourceMappingURL=plugins.js.map