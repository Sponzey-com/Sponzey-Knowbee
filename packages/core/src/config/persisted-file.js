import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import JSON5 from "json5";
export const NODE_PERSISTED_FILE_SYSTEM = Object.freeze({
    exists: existsSync,
    makeDirectory: (path) => { mkdirSync(path, { recursive: true }); },
    readText: (path) => readFileSync(path, "utf-8"),
    writeText: (path, content) => { writeFileSync(path, content, "utf-8"); },
    rename: renameSync,
    remove: (path) => { rmSync(path, { force: true }); },
});
export function readPersistedRawConfig(paths, fileSystem = NODE_PERSISTED_FILE_SYSTEM) {
    if (!fileSystem.exists(paths.configFile))
        return {};
    try {
        const parsed = JSON5.parse(fileSystem.readText(paths.configFile));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
export function writePersistedRawConfig(raw, paths, fileSystem = NODE_PERSISTED_FILE_SYSTEM) {
    writeAtomicTextFile(paths.configFile, JSON5.stringify(raw, null, 2), fileSystem);
}
export function writeAtomicTextFile(targetPath, content, fileSystem = NODE_PERSISTED_FILE_SYSTEM) {
    fileSystem.makeDirectory(dirname(targetPath));
    const tempPath = `${targetPath}.tmp-${randomUUID()}`;
    try {
        fileSystem.writeText(tempPath, content);
        fileSystem.rename(tempPath, targetPath);
    }
    finally {
        fileSystem.remove(tempPath);
    }
}
//# sourceMappingURL=persisted-file.js.map