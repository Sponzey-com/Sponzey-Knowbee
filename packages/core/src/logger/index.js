import { containsInternalLlmStructuredDataText, INTERNAL_LLM_DATA_MASK, isInternalLlmStructuredDataKey, } from "../security/internal-llm-data.js";
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const PURPOSE_VISIBILITY = { product: 0, debug: 1, development: 2 };
const COLORS = {
    debug: "\x1b[90m", // gray
    info: "\x1b[36m", // cyan
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const LOG_SECRET_MASK = "***";
const LOG_PATH_MASK = "[internal-path-redacted]";
const LOG_RAW_PAYLOAD_MASK = "[redacted-raw-payload]";
const SECRET_KEY_PATTERN = /api[_-]?key|auth[_-]?token|authorization|bearer|cookie|credential|password|private[_-]?key|refresh[_-]?token|secret|token/iu;
const RAW_PAYLOAD_KEY_PATTERN = /raw[_-]?(?:body|html|payload|response)|provider[_-]?raw|html(?:body)?/iu;
const RAW_HTML_PATTERN = /<!doctype\s+html|<html[\s>]|<body[\s>]|<script[\s>]/iu;
const LOCAL_PATH_PATTERN = /(?:\/Users\/[\w .@+-]+(?:\/[^\s"'`<>]*)+|\/private\/[\w .@+-]+(?:\/[^\s"'`<>]*)+|\/tmp\/[\w .@+-]+(?:\/[^\s"'`<>]*)+|\/var\/folders\/[\w .@+-]+(?:\/[^\s"'`<>]*)+|[A-Za-z]:\\[^\s"'`<>]+(?:\\[^\s"'`<>]+)*)/gu;
const PRODUCT_IDENTIFIER_KEY_PATTERN = /^(?:runId|requestGroupId|requestId|sessionId|channelId|chatId|threadId|threadTs|messageId|messageTs|userId|agentId|instanceId|extensionId|workerSessionId|subSessionId|parentRunId|rootRunId|externalChatId|externalThreadId|externalMessageId)$/u;
const PRODUCT_IDENTIFIER_TEXT_PATTERN = /\b(runId|requestGroupId|requestId|sessionId|channelId|channel|chatId|chat|threadId|threadTs|thread|messageId|messageTs|ts|userId|user|agentId|instanceId|extensionId|workerSessionId|subSessionId|parentRunId|rootRunId|externalChatId|externalThreadId|externalMessageId)=([^\s,]+)/giu;
const SECRET_TEXT_PATTERNS = [
    [/((?:api[_-]?key|auth[_-]?token|authorization|bearer|cookie|credential|password|private[_-]?key|refresh[_-]?token|secret|token)(?:["'\s:=]+))([^"'\s,}]+)/giu, `$1${LOG_SECRET_MASK}`],
    [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/giu, `Bearer ${LOG_SECRET_MASK}`],
    [/\bsk-[A-Za-z0-9_-]{12,}\b/gu, LOG_SECRET_MASK],
    [/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/gu, LOG_SECRET_MASK],
    [/\bxapp-[A-Za-z0-9-]{12,}\b/gu, LOG_SECRET_MASK],
    [/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/gu, LOG_SECRET_MASK],
    [/([A-Za-z0-9_-]{12,})\.([A-Za-z0-9_-]{12,})\.([A-Za-z0-9_-]{12,})/gu, LOG_SECRET_MASK],
];
function normalizeLogLevel(value) {
    if (value && value in LEVELS)
        return value;
    return "info";
}
export function normalizeLogPurposeVisibility(value, fallback = "product") {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "product")
        return "product";
    if (normalized === "debug")
        return "debug";
    if (normalized === "development" || normalized === "dev")
        return "development";
    return fallback;
}
const LOGGER_PROCESS = typeof process === "undefined" ? undefined : process;
const LOGGER_RUNTIME_ENV = Object.freeze({
    logLevel: LOGGER_PROCESS?.env["KNOWBEE_LOG_LEVEL"],
    logPurpose: LOGGER_PROCESS?.env["KNOWBEE_LOG_PURPOSE"],
    noColorDisabled: LOGGER_PROCESS?.env["KNOWBEE_NO_COLOR"] != null,
    stdoutIsTty: LOGGER_PROCESS?.stdout.isTTY === true,
});
const minLevel = normalizeLogLevel(LOGGER_RUNTIME_ENV.logLevel);
const LOG_POLICY = {
    minLevel,
    purposeVisibility: normalizeLogPurposeVisibility(LOGGER_RUNTIME_ENV.logPurpose, minLevel === "debug" ? "debug" : "product"),
    color: !LOGGER_RUNTIME_ENV.noColorDisabled && LOGGER_RUNTIME_ENV.stdoutIsTty,
};
export function redactLogText(value, purpose = "product") {
    if (!value)
        return value;
    if (containsInternalLlmStructuredDataText(value))
        return INTERNAL_LLM_DATA_MASK;
    if (RAW_HTML_PATTERN.test(value))
        return LOG_RAW_PAYLOAD_MASK;
    let output = value;
    for (const [pattern, replacement] of SECRET_TEXT_PATTERNS) {
        output = output.replace(pattern, replacement);
    }
    output = output.replace(LOCAL_PATH_PATTERN, LOG_PATH_MASK);
    if (purpose === "product") {
        output = output.replace(PRODUCT_IDENTIFIER_TEXT_PATTERN, "$1=[id-redacted]");
    }
    return output;
}
function redactLogValue(value, key = "", depth = 0, purpose = "product") {
    if (value == null)
        return value;
    if (depth > 8)
        return "[truncated]";
    if (isInternalLlmStructuredDataKey(key))
        return INTERNAL_LLM_DATA_MASK;
    if (RAW_PAYLOAD_KEY_PATTERN.test(key))
        return LOG_RAW_PAYLOAD_MASK;
    if (purpose === "product" && PRODUCT_IDENTIFIER_KEY_PATTERN.test(key))
        return "[id-redacted]";
    if (typeof value === "string") {
        if (SECRET_KEY_PATTERN.test(key))
            return LOG_SECRET_MASK;
        return redactLogText(value, purpose);
    }
    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactLogText(value.message, purpose),
        };
    }
    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => redactLogValue(item, key, depth + 1, purpose));
    }
    if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
            entryKey,
            SECRET_KEY_PATTERN.test(entryKey)
                ? LOG_SECRET_MASK
                : redactLogValue(entryValue, entryKey, depth + 1, purpose),
        ]));
    }
    return value;
}
function serializeArg(value, purpose) {
    if (value instanceof Error) {
        return JSON.stringify(redactLogValue(value, "", 0, purpose));
    }
    if (typeof value === "string")
        return redactLogText(value, purpose);
    try {
        return JSON.stringify(redactLogValue(value, "", 0, purpose));
    }
    catch {
        return redactLogText(String(value), purpose);
    }
}
function format(level, purpose, namespace, message, ...args) {
    const ts = new Date().toISOString().slice(11, 23);
    const color = LOG_POLICY.color;
    const extra = args.length > 0 ? " " + args.map((arg) => serializeArg(arg, purpose)).join(" ") : "";
    const purposeLabel = purpose.padEnd(11);
    const safeMessage = redactLogText(message, purpose);
    if (color) {
        return `${DIM}${ts}${RESET} ${COLORS[level]}${level.padEnd(5)}${RESET} ${purposeLabel} ${DIM}[${namespace}]${RESET} ${safeMessage}${extra}`;
    }
    return `${ts} ${level.padEnd(5)} ${purposeLabel} [${namespace}] ${safeMessage}${extra}`;
}
export function createLogger(namespace) {
    const minLevelValue = LEVELS[LOG_POLICY.minLevel];
    const maxPurposeVisibility = PURPOSE_VISIBILITY[LOG_POLICY.purposeVisibility];
    function log(level, purpose, message, ...args) {
        if (LEVELS[level] < minLevelValue)
            return;
        if (PURPOSE_VISIBILITY[purpose] > maxPurposeVisibility)
            return;
        const line = format(level, purpose, namespace, message, ...args);
        if (LOGGER_PROCESS) {
            if (level === "error") {
                LOGGER_PROCESS.stderr.write(line + "\n");
            }
            else {
                LOGGER_PROCESS.stdout.write(line + "\n");
            }
            return;
        }
        if (level === "error")
            console.error(line);
        else
            console.log(line);
    }
    return {
        product: (msg, ...args) => log("info", "product", msg, ...args),
        fieldDebug: (msg, ...args) => log("info", "debug", msg, ...args),
        development: (msg, ...args) => log("info", "development", msg, ...args),
        debug: (msg, ...args) => log("debug", "debug", msg, ...args),
        info: (msg, ...args) => log("info", "product", msg, ...args),
        warn: (msg, ...args) => log("warn", "product", msg, ...args),
        error: (msg, ...args) => log("error", "product", msg, ...args),
        child: (sub) => createLogger(`${namespace}:${sub}`),
    };
}
export const logger = createLogger("knowbee");
//# sourceMappingURL=index.js.map