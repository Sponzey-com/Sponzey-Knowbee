import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
function getDefaultStateDir(dependencies) {
    const knowbeeDir = join(dependencies.homeDir, ".knowbee");
    const wizbyDir = join(dependencies.homeDir, ".wizby");
    const howieDir = join(dependencies.homeDir, ".howie");
    if (dependencies.exists(knowbeeDir))
        return knowbeeDir;
    if (dependencies.exists(wizbyDir))
        return wizbyDir;
    if (dependencies.exists(howieDir))
        return howieDir;
    return knowbeeDir;
}
export function createRuntimePaths(env, dependencies = {
    homeDir: homedir(),
    exists: existsSync,
}) {
    const stateDir = env["KNOWBEE_STATE_DIR"] ??
        env["WIZBY_STATE_DIR"] ??
        env["HOWIE_STATE_DIR"] ??
        getDefaultStateDir(dependencies);
    const configFile = env["KNOWBEE_CONFIG"] ??
        env["WIZBY_CONFIG"] ??
        env["HOWIE_CONFIG"] ??
        join(stateDir, "config.json5");
    return Object.freeze({
        stateDir,
        configFile,
        dbFile: join(stateDir, "data.db"),
        memoryDbFile: join(stateDir, "memory.db3"),
        setupStateFile: join(stateDir, "setup-state.json"),
        lockFile: join(stateDir, "knowbee.lock"),
        logsDir: join(stateDir, "logs"),
        sessionsDir: join(stateDir, "sessions"),
        pluginsDir: join(stateDir, "plugins"),
    });
}
export function captureRuntimePaths() {
    return createRuntimePaths({ ...process.env });
}
//# sourceMappingURL=paths.js.map