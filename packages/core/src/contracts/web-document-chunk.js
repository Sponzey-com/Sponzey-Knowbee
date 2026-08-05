import { createHash } from "node:crypto";
import { validateWebDocument } from "./web-retrieval.js";
const MIN_CHUNK_TOKENS = 300;
const MAX_CHUNK_TOKENS = 600;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
function sha256(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function estimate(estimator, text) {
    try {
        const value = estimator.estimateTokens(text);
        return Number.isInteger(value) && value >= 0 ? value : null;
    }
    catch {
        return null;
    }
}
function headingEvents(markdown) {
    const events = [];
    const path = [];
    const pattern = /^(#{1,6})[ \t]+(.+?)\s*$/gmu;
    for (const match of markdown.matchAll(pattern)) {
        const level = match[1]?.length ?? 1;
        const label = match[2]?.trim();
        if (!label || match.index === undefined)
            continue;
        path.length = level - 1;
        path[level - 1] = label;
        events.push(Object.freeze({
            offset: match.index,
            path: Object.freeze(path.filter(Boolean)),
        }));
    }
    return Object.freeze(events);
}
function preferredParagraphEnds(markdown) {
    const ends = new Set();
    const separator = /\n[ \t]*\n+/gu;
    let start = 0;
    for (const match of markdown.matchAll(separator)) {
        const rawEnd = match.index ?? start;
        const content = markdown.slice(start, rawEnd);
        const trailingWhitespace = content.match(/\s+$/u)?.[0].length ?? 0;
        if (rawEnd - trailingWhitespace > start)
            ends.add(rawEnd - trailingWhitespace);
        start = rawEnd + match[0].length;
    }
    const trailingWhitespace = markdown.slice(start).match(/\s+$/u)?.[0].length ?? 0;
    const finalEnd = markdown.length - trailingWhitespace;
    if (finalEnd > start)
        ends.add(finalEnd);
    return ends;
}
function pathAt(events, offset) {
    let path = Object.freeze([]);
    for (const event of events) {
        if (event.offset > offset)
            break;
        path = event.path;
    }
    return Object.freeze([...path]);
}
export function chunkWebDocument(input, estimator) {
    const validated = validateWebDocument(input.document);
    if (!validated.ok) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_document_invalid" });
    }
    if (!SHA256.test(input.budgetFingerprint)) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_budget_fingerprint_invalid" });
    }
    if (!estimator?.version?.trim() || typeof estimator.estimateTokens !== "function") {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_estimator_invalid" });
    }
    const markdown = validated.value.markdown;
    const words = [...markdown.matchAll(/\S+/gu)].map((match) => ({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
    }));
    const paragraphEnds = preferredParagraphEnds(markdown);
    const headings = headingEvents(markdown);
    const chunks = [];
    let wordIndex = 0;
    while (wordIndex < words.length) {
        const start = words[wordIndex].start;
        let maximumWordIndex = wordIndex - 1;
        let scan = wordIndex;
        while (scan < words.length) {
            const candidateEnd = words[scan].end;
            const tokenCount = estimate(estimator, markdown.slice(start, candidateEnd));
            if (tokenCount === null) {
                return Object.freeze({ ok: false, reasonCode: "web_chunk_estimator_invalid" });
            }
            if (tokenCount > MAX_CHUNK_TOKENS)
                break;
            maximumWordIndex = scan;
            scan += 1;
        }
        if (maximumWordIndex < wordIndex) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_content_unbreakable" });
        }
        let selectedWordIndex = maximumWordIndex;
        for (let candidate = maximumWordIndex; candidate >= wordIndex; candidate -= 1) {
            const end = words[candidate].end;
            if (!paragraphEnds.has(end))
                continue;
            const tokenCount = estimate(estimator, markdown.slice(start, end));
            if (tokenCount !== null && tokenCount >= MIN_CHUNK_TOKENS) {
                selectedWordIndex = candidate;
                break;
            }
        }
        const end = words[selectedWordIndex].end;
        const content = markdown.slice(start, end);
        const estimatedTokens = estimate(estimator, content);
        if (estimatedTokens === null) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_estimator_invalid" });
        }
        const isLast = selectedWordIndex === words.length - 1;
        if (!isLast && estimatedTokens < MIN_CHUNK_TOKENS) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_content_unbreakable" });
        }
        const ordinal = chunks.length + 1;
        const contentFingerprint = sha256(content);
        chunks.push(Object.freeze({
            chunkRef: `${validated.value.evidenceRef}:chunk:${ordinal}:${contentFingerprint.slice(7, 23)}`,
            documentEvidenceRef: validated.value.evidenceRef,
            ordinal,
            headingPath: pathAt(headings, start),
            content,
            estimatedTokens,
            contentFingerprint,
            sourceOffsets: Object.freeze({ start, end }),
            budgetFingerprint: input.budgetFingerprint,
        }));
        wordIndex = selectedWordIndex + 1;
    }
    return Object.freeze({ ok: true, value: Object.freeze(chunks) });
}
//# sourceMappingURL=web-document-chunk.js.map