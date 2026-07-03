import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
const MAX_KNOWBEE_MD_SIZE = 8000;
const MAX_SYSTEM_PROMPT_SIZE = 90000;
const MEMORY_FILENAMES = ["KNOWBEE.md", "WIZBY.md", "HOWIE.md"];
const PROMPTS_DIRNAME = "prompts";
const PROMPT_ASSEMBLY_POLICY_VERSION = 1;
const PROMPTS_DIR_SEARCH_DEPTH = 8;
const MODULE_DIRNAME = dirname(fileURLToPath(import.meta.url));
const PROMPT_SOURCE_DEFINITIONS = [
    { sourceId: "system", filenames: { ko: "system.ko.md", en: "system.md" }, priority: 5, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "definitions", filenames: { ko: "definitions.ko.md", en: "definitions.md" }, priority: 10, required: true, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "identity", filenames: { ko: "identity.ko.md", en: "identity.md" }, priority: 20, required: true, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "user", filenames: { ko: "user.ko.md", en: "user.md" }, priority: 30, required: true, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "soul", filenames: { ko: "soul.ko.md", en: "soul.md" }, priority: 40, required: true, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "planner", filenames: { ko: "planner.ko.md", en: "planner.md" }, priority: 50, required: true, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "knowbee_execution", filenames: { ko: "knowbee-execution.ko.md", en: "knowbee-execution.md" }, priority: 55, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "memory_policy", filenames: { ko: "memory_policy.ko.md", en: "memory_policy.md" }, priority: 60, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "tool_policy", filenames: { ko: "tool_policy.ko.md", en: "tool_policy.md" }, priority: 70, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "web_retrieval_planner", filenames: { ko: "web_retrieval_planner.ko.md", en: "web_retrieval_planner.md" }, priority: 75, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "recovery_policy", filenames: { ko: "recovery_policy.ko.md", en: "recovery_policy.md" }, priority: 80, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "topology_executor_policy", filenames: { ko: "topology_executor_policy.ko.md", en: "topology_executor_policy.md" }, priority: 85, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "completion_policy", filenames: { ko: "completion_policy.ko.md", en: "completion_policy.md" }, priority: 90, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "output_policy", filenames: { ko: "output_policy.ko.md", en: "output_policy.md" }, priority: 100, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "channel", filenames: { ko: "channel.ko.md", en: "channel.md" }, priority: 110, required: false, usageScope: "runtime", defaultRuntime: true },
    { sourceId: "bootstrap", filenames: { ko: "bootstrap.ko.md", en: "bootstrap.md" }, priority: 120, required: true, usageScope: "first_run", defaultRuntime: false },
    { sourceId: "task_intake", filenames: { ko: "task_intake.ko.md", en: "task_intake.md" }, priority: 200, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "completion_review", filenames: { ko: "completion_review.ko.md", en: "completion_review.md" }, priority: 210, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "task_intake_user", filenames: { ko: "task_intake_user.ko.md", en: "task_intake_user.md" }, priority: 215, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "completion_review_user", filenames: { ko: "completion_review_user.ko.md", en: "completion_review_user.md" }, priority: 216, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "request_continuation", filenames: { ko: "request_continuation.ko.md", en: "request_continuation.md" }, priority: 220, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "execution_decision_harness", filenames: { ko: "execution_decision_harness.ko.md", en: "execution_decision_harness.md" }, priority: 230, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "ai_connection_test", filenames: { ko: "ai_connection_test.ko.md", en: "ai_connection_test.md" }, priority: 240, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "schedule_comparison", filenames: { ko: "schedule_comparison.ko.md", en: "schedule_comparison.md" }, priority: 250, required: false, usageScope: "internal", defaultRuntime: false },
    { sourceId: "node_definition_suggestion", filenames: { ko: "node_definition_suggestion.ko.md", en: "node_definition_suggestion.md" }, priority: 260, required: false, usageScope: "internal", defaultRuntime: false },
];
const DEFAULT_PROMPT_SOURCE_SEED_LOCALES = ["en"];
export const REQUIRED_RUNTIME_PROMPT_SOURCE_IDS = PROMPT_SOURCE_DEFINITIONS
    .filter((definition) => definition.required && definition.defaultRuntime)
    .map((definition) => definition.sourceId);
function buildPromptSeedSearchDirs(workDir) {
    const candidates = [
        findPromptsDirInAncestors(workDir),
        findPromptsDirInAncestors(process.cwd()),
        findPromptsDirInAncestors(MODULE_DIRNAME),
        join(process.cwd(), PROMPTS_DIRNAME),
    ];
    const unique = [];
    for (const candidate of candidates) {
        if (!candidate || !existsSync(candidate) || unique.includes(candidate))
            continue;
        unique.push(candidate);
    }
    return unique;
}
function promptSeedFilenames(definition, locale) {
    const candidates = [definition.filenames[locale], definition.filenames.en, definition.filenames.ko];
    const unique = [];
    for (const candidate of candidates) {
        if (!unique.includes(candidate))
            unique.push(candidate);
    }
    return unique;
}
function readPromptSourceSeedContent(workDir, definition, locale, excludePath) {
    for (const promptsDir of buildPromptSeedSearchDirs(workDir)) {
        for (const filename of promptSeedFilenames(definition, locale)) {
            const candidate = join(promptsDir, filename);
            if (excludePath && candidate === excludePath)
                continue;
            if (!existsSync(candidate))
                continue;
            try {
                const content = readFileSync(candidate, "utf-8").trim();
                if (!content || !isPromptSourceContentSafe(content))
                    continue;
                return content;
            }
            catch {
                // Ignore one unreadable seed source and continue looking for a file-backed prompt.
            }
        }
    }
    return null;
}
const PROMPT_SOURCE_SECRET_PATTERNS = [
    { marker: "api_key_assignment", pattern: /\b(?:api[_ -]?key|apikey)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i },
    { marker: "oauth_token_assignment", pattern: /\b(?:oauth[_ -]?token|access[_ -]?token|refresh[_ -]?token)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i },
    { marker: "bot_token_assignment", pattern: /\b(?:bot[_ -]?token|telegram[_ -]?token|slack[_ -]?token)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i },
    { marker: "channel_secret_assignment", pattern: /\b(?:channel[_ -]?secret|client[_ -]?secret|signing[_ -]?secret)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i },
    { marker: "openai_secret_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
];
const promptAssemblyCache = new Map();
/**
 * Walk up from workDir (up to 3 parent levels) searching for KNOWBEE.md first,
 * then legacy WIZBY.md / HOWIE.md.
 * Returns the file contents (trimmed to 8KB) or null if not found.
 */
export function loadKnowbeeMd(workDir) {
    let current = workDir;
    for (let i = 0; i < 4; i++) {
        for (const filename of MEMORY_FILENAMES) {
            const candidate = join(current, filename);
            if (existsSync(candidate)) {
                try {
                    return readFileSync(candidate, "utf-8").slice(0, MAX_KNOWBEE_MD_SIZE);
                }
                catch {
                    return null;
                }
            }
        }
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
function findPromptsDirInAncestors(workDir) {
    let current = workDir;
    for (let i = 0; i < PROMPTS_DIR_SEARCH_DEPTH; i++) {
        const candidate = join(current, PROMPTS_DIRNAME);
        if (existsSync(candidate))
            return candidate;
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
function findPromptsDir(workDir) {
    const ancestorCandidate = findPromptsDirInAncestors(workDir);
    if (ancestorCandidate)
        return ancestorCandidate;
    const cwdCandidate = join(process.cwd(), PROMPTS_DIRNAME);
    if (existsSync(cwdCandidate))
        return cwdCandidate;
    return null;
}
function resolvePromptsDirForSeed(workDir) {
    return findPromptsDirInAncestors(workDir) ?? join(workDir, PROMPTS_DIRNAME);
}
function checksumContent(content) {
    return createHash("sha256").update(content).digest("hex");
}
export function detectPromptSourceSecretMarkers(content) {
    return PROMPT_SOURCE_SECRET_PATTERNS
        .filter(({ pattern }) => pattern.test(content))
        .map(({ marker }) => marker);
}
export function isPromptSourceContentSafe(content) {
    return detectPromptSourceSecretMarkers(content).length === 0;
}
export function ensurePromptSourceFiles(workDir) {
    const promptsDir = resolvePromptsDirForSeed(workDir);
    mkdirSync(promptsDir, { recursive: true });
    const created = [];
    const existing = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS) {
        for (const locale of DEFAULT_PROMPT_SOURCE_SEED_LOCALES) {
            const filename = definition.filenames[locale];
            const target = join(promptsDir, filename);
            if (existsSync(target)) {
                existing.push(filename);
                continue;
            }
            const content = readPromptSourceSeedContent(workDir, definition, locale, target);
            if (!content)
                continue;
            writeFileSync(target, content.trim() + "\n", "utf-8");
            created.push(filename);
        }
    }
    return {
        promptsDir,
        created,
        existing,
        registry: loadPromptSourceRegistry(promptsDir),
    };
}
export function loadPromptSourceRegistry(workDir) {
    const promptsDir = findPromptsDir(workDir);
    if (!promptsDir)
        return [];
    const sources = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS) {
        for (const locale of ["ko", "en"]) {
            const filename = definition.filenames[locale];
            const candidate = join(promptsDir, filename);
            if (!existsSync(candidate))
                continue;
            try {
                const content = readFileSync(candidate, "utf-8").trim();
                if (!content)
                    continue;
                if (!isPromptSourceContentSafe(content))
                    continue;
                const checksum = checksumContent(content);
                sources.push({
                    sourceId: definition.sourceId,
                    locale,
                    path: candidate,
                    version: checksum.slice(0, 12),
                    priority: definition.priority,
                    enabled: true,
                    required: definition.required,
                    usageScope: definition.usageScope,
                    checksum,
                    content,
                });
            }
            catch {
                // Ignore one unreadable prompt source. Required-source validation is handled by assembly.
            }
        }
    }
    return sources.sort((a, b) => (a.priority - b.priority) || a.sourceId.localeCompare(b.sourceId) || a.locale.localeCompare(b.locale));
}
function applyPromptSourceStates(sources, states) {
    if (states.length === 0)
        return sources;
    const stateByKey = new Map(states.map((state) => [`${state.sourceId}:${state.locale}`, state]));
    return sources.map((source) => {
        const state = stateByKey.get(`${source.sourceId}:${source.locale}`);
        return state ? { ...source, enabled: state.enabled } : source;
    });
}
function selectRuntimePromptSources(sources, locale) {
    const bySourceId = new Map();
    for (const source of sources) {
        if (source.usageScope !== "runtime")
            continue;
        if (!source.enabled && !source.required)
            continue;
        if (!PROMPT_SOURCE_DEFINITIONS.find((definition) => definition.sourceId === source.sourceId)?.defaultRuntime)
            continue;
        const bucket = bySourceId.get(source.sourceId) ?? [];
        bucket.push(source);
        bySourceId.set(source.sourceId, bucket);
    }
    const selected = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS.filter((item) => item.defaultRuntime)) {
        const candidates = bySourceId.get(definition.sourceId) ?? [];
        const preferred = candidates.find((source) => source.locale === locale)
            ?? candidates.find((source) => source.locale === "ko")
            ?? candidates[0];
        if (preferred)
            selected.push(preferred);
    }
    return selected.sort((a, b) => a.priority - b.priority);
}
function selectPromptSourcesByUsageScope(sources, locale, usageScope) {
    const bySourceId = new Map();
    for (const source of sources) {
        if (source.usageScope !== usageScope)
            continue;
        if (!source.enabled && !source.required)
            continue;
        const bucket = bySourceId.get(source.sourceId) ?? [];
        bucket.push(source);
        bySourceId.set(source.sourceId, bucket);
    }
    const selected = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS.filter((item) => item.usageScope === usageScope)) {
        const candidates = bySourceId.get(definition.sourceId) ?? [];
        const preferred = candidates.find((source) => source.locale === locale)
            ?? candidates.find((source) => source.locale === "ko")
            ?? candidates[0];
        if (preferred)
            selected.push(preferred);
    }
    return selected.sort((a, b) => a.priority - b.priority);
}
function buildRequiredPromptSourceDiagnostics(selected, locale, usageScope) {
    const selectedIds = new Set(selected.map((source) => source.sourceId));
    return PROMPT_SOURCE_DEFINITIONS
        .filter((definition) => definition.required && definition.usageScope === usageScope)
        .filter((definition) => usageScope !== "runtime" || definition.defaultRuntime)
        .filter((definition) => !selectedIds.has(definition.sourceId))
        .map((definition) => ({
        severity: "error",
        code: "required_prompt_source_missing",
        sourceId: definition.sourceId,
        locale,
        message: `Required prompt source '${definition.sourceId}' is missing for ${usageScope} assembly.`,
    }));
}
function buildPromptStateSignature(states) {
    return states
        .map((state) => `${state.sourceId}:${state.locale}:${state.enabled ? "1" : "0"}`)
        .sort()
        .join("|");
}
function buildPromptRegistrySignature(sources) {
    return sources
        .map((source) => [
        source.sourceId,
        source.locale,
        source.checksum,
        source.enabled ? "1" : "0",
        source.priority,
        source.usageScope,
    ].join(":"))
        .join("|");
}
function buildPromptTemplateVariableSignature(variables) {
    return Object.entries(variables)
        .map(([key, value]) => `${key}=${String(value ?? "")}`)
        .sort()
        .join("|");
}
export function renderPromptTemplate(content, variables = {}) {
    return content.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, key) => {
        if (!Object.prototype.hasOwnProperty.call(variables, key))
            return match;
        return String(variables[key] ?? "");
    });
}
function selectPromptTemplateSource(registry, sourceId, locale) {
    const candidates = registry.filter((source) => source.sourceId === sourceId);
    return candidates.find((source) => source.locale === locale)
        ?? candidates.find((source) => source.locale === "en")
        ?? candidates.find((source) => source.locale === "ko")
        ?? candidates[0];
}
export function loadPromptTemplate(input) {
    const workDir = input.workDir ?? process.cwd();
    const locale = input.locale ?? "en";
    const registry = loadPromptSourceRegistry(workDir);
    const source = selectPromptTemplateSource(registry, input.sourceId, locale);
    const definition = resolvePromptSourceDefinition(input.sourceId);
    const fallback = definition ? readPromptSourceSeedContent(workDir, definition, locale) : null;
    const content = source?.content ?? fallback;
    if (!content)
        throw new Error(`prompt template not found: ${input.sourceId}`);
    return renderPromptTemplate(content, input.variables ?? {});
}
export function loadSystemPromptSourceAssembly(workDir, locale = "en", states = [], variables = {}) {
    const registry = applyPromptSourceStates(loadPromptSourceRegistry(workDir), states);
    const runtimeSources = selectRuntimePromptSources(registry, locale);
    if (runtimeSources.length === 0)
        return null;
    const cacheKey = [
        `policy=${PROMPT_ASSEMBLY_POLICY_VERSION}`,
        `workDir=${workDir}`,
        `locale=${locale}`,
        `states=${buildPromptStateSignature(states)}`,
        `sources=${buildPromptRegistrySignature(runtimeSources)}`,
        `variables=${buildPromptTemplateVariableSignature(variables)}`,
    ].join("\n");
    const cached = promptAssemblyCache.get(cacheKey);
    if (cached)
        return cached;
    const text = runtimeSources
        .map((source) => `[Prompt Source: ${source.sourceId}:${source.locale}@${source.version}]\n${renderPromptTemplate(source.content, variables)}`)
        .join("\n\n---\n\n")
        .slice(0, MAX_SYSTEM_PROMPT_SIZE);
    const assembly = {
        text,
        snapshot: {
            assemblyVersion: 1,
            createdAt: Date.now(),
            sources: runtimeSources.map(({ content: _content, ...metadata }) => metadata),
            diagnostics: buildRequiredPromptSourceDiagnostics(runtimeSources, locale, "runtime"),
        },
        sources: runtimeSources,
    };
    promptAssemblyCache.set(cacheKey, assembly);
    return assembly;
}
export function loadFirstRunPromptSourceAssembly(workDir, locale = "en", states = []) {
    const registry = applyPromptSourceStates(loadPromptSourceRegistry(workDir), states);
    const firstRunSources = selectPromptSourcesByUsageScope(registry, locale, "first_run");
    if (firstRunSources.length === 0)
        return null;
    const cacheKey = [
        `policy=${PROMPT_ASSEMBLY_POLICY_VERSION}`,
        "scope=first_run",
        `workDir=${workDir}`,
        `locale=${locale}`,
        `states=${buildPromptStateSignature(states)}`,
        `sources=${buildPromptRegistrySignature(firstRunSources)}`,
    ].join("\n");
    const cached = promptAssemblyCache.get(cacheKey);
    if (cached)
        return cached;
    const text = firstRunSources
        .map((source) => `[Prompt Source: ${source.sourceId}:${source.locale}@${source.version}]\n${source.content}`)
        .join("\n\n---\n\n")
        .slice(0, MAX_SYSTEM_PROMPT_SIZE);
    const assembly = {
        text,
        snapshot: {
            assemblyVersion: 1,
            createdAt: Date.now(),
            sources: firstRunSources.map(({ content: _content, ...metadata }) => metadata),
            diagnostics: buildRequiredPromptSourceDiagnostics(firstRunSources, locale, "first_run"),
        },
        sources: firstRunSources,
    };
    promptAssemblyCache.set(cacheKey, assembly);
    return assembly;
}
/**
 * Load canonical runtime prompt sources from prompts/.
 * Bootstrap prompts are intentionally excluded from the default runtime assembly.
 */
export function loadSystemPromptSources(workDir) {
    return loadSystemPromptSourceAssembly(workDir)?.text ?? null;
}
function resolvePromptSourceDefinition(sourceId) {
    return PROMPT_SOURCE_DEFINITIONS.find((definition) => definition.sourceId === sourceId);
}
function resolvePromptSourcePath(workDir, sourceId, locale) {
    const definition = resolvePromptSourceDefinition(sourceId);
    if (!definition)
        throw new Error(`unknown prompt source: ${sourceId}`);
    const promptsDir = findPromptsDir(workDir) ?? resolvePromptsDirForSeed(workDir);
    return join(promptsDir, definition.filenames[locale]);
}
export function promptSourceFileExists(workDir, sourceId, locale) {
    try {
        return existsSync(resolvePromptSourcePath(workDir, sourceId, locale));
    }
    catch {
        return false;
    }
}
function requirePromptSourceFile(workDir, sourceId, locale) {
    const sourcePath = resolvePromptSourcePath(workDir, sourceId, locale);
    if (!existsSync(sourcePath))
        throw new Error(`prompt source not found: ${sourceId}:${locale}`);
    return sourcePath;
}
function normalizePromptSourceComparableContent(content) {
    return content.replace(/\r/g, "").trim();
}
function splitPromptSourceComparableLines(content) {
    const normalized = normalizePromptSourceComparableContent(content);
    return normalized ? normalized.split("\n") : [];
}
export function buildPromptSourceContentDiff(beforeContent, afterContent) {
    const normalizedBefore = normalizePromptSourceComparableContent(beforeContent);
    const normalizedAfter = normalizePromptSourceComparableContent(afterContent);
    const beforeLines = splitPromptSourceComparableLines(normalizedBefore);
    const afterLines = splitPromptSourceComparableLines(normalizedAfter);
    const max = Math.max(beforeLines.length, afterLines.length);
    const lines = [];
    for (let index = 0; index < max; index++) {
        const before = beforeLines[index];
        const after = afterLines[index];
        if (before === after) {
            if (before !== undefined)
                lines.push({ kind: "unchanged", beforeLine: index + 1, afterLine: index + 1, before, after: before });
            continue;
        }
        if (before !== undefined && after !== undefined) {
            lines.push({ kind: "changed", beforeLine: index + 1, afterLine: index + 1, before, after });
            continue;
        }
        if (before !== undefined) {
            lines.push({ kind: "removed", beforeLine: index + 1, before });
            continue;
        }
        if (after !== undefined) {
            lines.push({ kind: "added", afterLine: index + 1, after });
        }
    }
    const beforeChecksum = checksumContent(normalizedBefore);
    const afterChecksum = checksumContent(normalizedAfter);
    return {
        beforeChecksum,
        afterChecksum,
        changed: beforeChecksum !== afterChecksum,
        lines,
    };
}
export function createPromptSourceBackup(workDir, sourceId, locale) {
    const sourcePath = requirePromptSourceFile(workDir, sourceId, locale);
    const content = readFileSync(sourcePath, "utf-8");
    const checksum = checksumContent(content);
    const createdAt = Date.now();
    const backupDir = join(dirname(sourcePath), ".backups");
    mkdirSync(backupDir, { recursive: true });
    const backupId = `${sourceId}.${locale}.${createdAt}.${checksum.slice(0, 12)}.${basename(sourcePath)}`;
    const backupPath = join(backupDir, backupId);
    copyFileSync(sourcePath, backupPath);
    return { backupId, sourceId, locale, sourcePath, backupPath, checksum, createdAt };
}
export function exportPromptSourcesToFile(input) {
    const sources = loadPromptSourceRegistry(input.workDir);
    const createdAt = Date.now();
    const payload = {
        kind: "knowbee.prompt-sources.export",
        version: 1,
        createdAt,
        sources,
    };
    mkdirSync(dirname(input.outputPath), { recursive: true });
    writeFileSync(input.outputPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    const checksum = checksumContent(readFileSync(input.outputPath, "utf-8"));
    return {
        exportPath: input.outputPath,
        checksum,
        createdAt,
        sourceCount: sources.length,
        sources: sources.map(({ content: _content, ...metadata }) => metadata),
    };
}
export function importPromptSourcesFromFile(input) {
    const parsed = JSON.parse(readFileSync(input.exportPath, "utf-8"));
    if (parsed.kind !== "knowbee.prompt-sources.export" || parsed.version !== 1 || !Array.isArray(parsed.sources)) {
        throw new Error("invalid prompt source export file");
    }
    const imported = [];
    const skipped = [];
    const backups = [];
    for (const source of parsed.sources) {
        const sourceId = source.sourceId;
        const locale = source.locale;
        const key = `${sourceId}:${locale}`;
        if (locale !== "ko" && locale !== "en") {
            skipped.push(key);
            continue;
        }
        if (!isPromptSourceContentSafe(source.content))
            throw new Error(`prompt source export contains secret-like content: ${key}`);
        let targetPath;
        try {
            targetPath = resolvePromptSourcePath(input.workDir, sourceId, locale);
        }
        catch {
            skipped.push(key);
            continue;
        }
        if (existsSync(targetPath)) {
            if (!input.overwrite) {
                skipped.push(key);
                continue;
            }
            const result = writePromptSourceWithBackup({
                workDir: input.workDir,
                sourceId,
                locale,
                content: source.content,
            });
            if (result.backup)
                backups.push(result.backup);
            if (result.diff.changed)
                imported.push(key);
            else
                skipped.push(key);
            continue;
        }
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, source.content.trimEnd() + "\n", "utf-8");
        imported.push(key);
    }
    promptAssemblyCache.clear();
    return {
        exportPath: input.exportPath,
        imported,
        skipped,
        backups,
        registry: loadPromptSourceRegistry(input.workDir).map(({ content: _content, ...metadata }) => metadata),
    };
}
export function writePromptSourceWithBackup(input) {
    const sourcePath = requirePromptSourceFile(input.workDir, input.sourceId, input.locale);
    const beforeContent = readFileSync(sourcePath, "utf-8");
    const nextContent = input.content.trimEnd() + "\n";
    if (!isPromptSourceContentSafe(nextContent))
        throw new Error("prompt source contains secret-like content");
    const diff = buildPromptSourceContentDiff(normalizePromptSourceComparableContent(beforeContent), normalizePromptSourceComparableContent(nextContent));
    const backup = diff.changed && input.createBackup !== false
        ? createPromptSourceBackup(input.workDir, input.sourceId, input.locale)
        : null;
    if (diff.changed)
        writeFileSync(sourcePath, nextContent, "utf-8");
    const source = loadPromptSourceRegistry(input.workDir).find((item) => item.sourceId === input.sourceId && item.locale === input.locale);
    if (!source)
        throw new Error(`prompt source reload failed: ${input.sourceId}:${input.locale}`);
    promptAssemblyCache.clear();
    return { backup, source, diff };
}
export function rollbackPromptSourceBackup(input) {
    if (!existsSync(input.sourcePath))
        throw new Error("prompt source file not found");
    if (!existsSync(input.backupPath))
        throw new Error("prompt source backup not found");
    const previousContent = readFileSync(input.sourcePath, "utf-8");
    const restoredContent = readFileSync(input.backupPath, "utf-8");
    if (!isPromptSourceContentSafe(restoredContent))
        throw new Error("prompt source backup contains secret-like content");
    writeFileSync(input.sourcePath, restoredContent, "utf-8");
    promptAssemblyCache.clear();
    return {
        sourcePath: input.sourcePath,
        backupPath: input.backupPath,
        restoredChecksum: checksumContent(normalizePromptSourceComparableContent(restoredContent)),
        previousChecksum: checksumContent(normalizePromptSourceComparableContent(previousContent)),
    };
}
export function dryRunPromptSourceAssembly(workDir, locale = "en", states = []) {
    const assembly = loadSystemPromptSourceAssembly(workDir, locale, states);
    const sources = assembly?.sources ?? [];
    return {
        assembly,
        sourceOrder: sources.map((source) => ({
            sourceId: source.sourceId,
            locale: source.locale,
            checksum: source.checksum,
            version: source.version,
            path: source.path,
        })),
        totalChars: assembly?.text.length ?? 0,
        diagnostics: assembly?.snapshot.diagnostics ?? buildRequiredPromptSourceDiagnostics([], locale, "runtime"),
    };
}
function extractHeadingKeys(content) {
    return content
        .split(/\n/u)
        .map((line) => line.match(/^#{1,3}\s+(.+)$/u)?.[1]?.trim().toLowerCase())
        .filter((value) => Boolean(value));
}
export function checkPromptSourceLocaleParity(workDir) {
    const promptsDir = findPromptsDir(workDir);
    if (!promptsDir) {
        return { ok: false, issues: [{ sourceId: "prompts", code: "missing_locale", message: "prompts directory was not found" }] };
    }
    const issues = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS) {
        const koPath = join(promptsDir, definition.filenames.ko);
        const enPath = join(promptsDir, definition.filenames.en);
        const hasKo = existsSync(koPath);
        const hasEn = existsSync(enPath);
        if (!hasEn)
            issues.push({ sourceId: definition.sourceId, code: "missing_locale", locale: "en", message: `${definition.sourceId} is missing English source` });
        if (!hasKo || !hasEn)
            continue;
        const koHeadings = extractHeadingKeys(readFileSync(koPath, "utf-8"));
        const enHeadings = extractHeadingKeys(readFileSync(enPath, "utf-8"));
        const minHeadingCount = Math.min(koHeadings.length, enHeadings.length);
        if (minHeadingCount === 0)
            continue;
        const headingDelta = Math.abs(koHeadings.length - enHeadings.length);
        if (headingDelta > 2) {
            issues.push({
                sourceId: definition.sourceId,
                code: "section_mismatch",
                message: `${definition.sourceId} locale headings differ too much (${koHeadings.length} vs ${enHeadings.length})`,
            });
        }
    }
    return { ok: issues.length === 0, issues };
}
const TEMPLATE = `# 프로젝트 메모리

## 기술 스택
- (사용하는 언어, 프레임워크, 런타임 등을 기술)

## 코드 규칙
- (코딩 컨벤션, 포맷터, 린터 설정 등)

## 중요 경로
- (설정 파일, DB, 로그 등 주요 경로)

## 금지사항
- (절대로 하면 안 되는 작업)

## 기타 메모
- (에이전트가 알아야 할 기타 사항)
`;
/** Write a KNOWBEE.md template to the given directory. */
export function initKnowbeeMd(dir) {
    const target = join(dir, "KNOWBEE.md");
    if (!existsSync(target)) {
        writeFileSync(target, TEMPLATE, "utf-8");
    }
    return target;
}
export const loadWizbyMd = loadKnowbeeMd;
export const initWizbyMd = initKnowbeeMd;
export const loadHowieMd = loadKnowbeeMd;
export const initHowieMd = initKnowbeeMd;
//# sourceMappingURL=knowbee-md.js.map