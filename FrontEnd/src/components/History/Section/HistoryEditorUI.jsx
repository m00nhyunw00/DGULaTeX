/**
 * =================================================================
 * [Component] History Editor UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React from "react";
import Editor from "@monaco-editor/react";
import { getUserColor, hexToRgba } from "../../../utils/userColor";

const splitLines = (text = "") => String(text ?? "").replace(/\r\n/g, "\n").split("\n");

const getLineStarts = (lines = []) => {
    const starts = [];
    let offset = 0;

    for (const line of lines) {
        starts.push(offset);
        offset += Array.from(line).length + 1;
    }

    return starts;
};

const compactParts = (parts) => {
    const compacted = [];

    for (const part of parts) {
        if (!part.text) continue;

        const previous = compacted[compacted.length - 1];
        if (previous && previous.type === part.type) {
            previous.text += part.text;
        } else {
            compacted.push({ ...part });
        }
    }

    const normalized = [];
    for (let i = 0; i < compacted.length; i += 1) {
        const current = compacted[i];
        const next = compacted[i + 1];

        if (current?.type === "remove" && next?.type === "add") {
            normalized.push(next, current);
            i += 1;
        } else {
            normalized.push(current);
        }
    }

    return normalized;
};

const diffChars = (previousLine = "", currentLine = "", previousStart = 0, currentStart = 0) => {
    const previousChars = Array.from(previousLine);
    const currentChars = Array.from(currentLine);
    const rows = previousChars.length;
    const cols = currentChars.length;
    const dp = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));

    for (let i = rows - 1; i >= 0; i -= 1) {
        for (let j = cols - 1; j >= 0; j -= 1) {
            dp[i][j] = previousChars[i] === currentChars[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const parts = [];
    let i = 0;
    let j = 0;

    while (i < rows && j < cols) {
        if (previousChars[i] === currentChars[j]) {
            parts.push({ type: "equal", text: currentChars[j], previousStart: previousStart + i, currentStart: currentStart + j });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            parts.push({ type: "remove", text: previousChars[i], previousStart: previousStart + i });
            i += 1;
        } else {
            parts.push({ type: "add", text: currentChars[j], currentStart: currentStart + j });
            j += 1;
        }
    }

    while (i < rows) {
        parts.push({ type: "remove", text: previousChars[i], previousStart: previousStart + i });
        i += 1;
    }

    while (j < cols) {
        parts.push({ type: "add", text: currentChars[j], currentStart: currentStart + j });
        j += 1;
    }

    return compactParts(parts);
};

const buildLineRows = (previousContent = "", currentContent = "") => {
    const previousLines = splitLines(previousContent);
    const currentLines = splitLines(currentContent);
    const previousLineStarts = getLineStarts(previousLines);
    const currentLineStarts = getLineStarts(currentLines);
    const prevCount = previousLines.length;
    const currCount = currentLines.length;
    const dp = Array.from({ length: prevCount + 1 }, () => Array(currCount + 1).fill(0));

    for (let i = prevCount - 1; i >= 0; i -= 1) {
        for (let j = currCount - 1; j >= 0; j -= 1) {
            dp[i][j] = previousLines[i] === currentLines[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const ops = [];
    let i = 0;
    let j = 0;

    while (i < prevCount && j < currCount) {
        if (previousLines[i] === currentLines[j]) {
            ops.push({ type: "equal", previousLine: previousLines[i], currentLine: currentLines[j], previousStart: previousLineStarts[i], currentStart: currentLineStarts[j], currentNumber: j + 1 });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push({ type: "remove", previousLine: previousLines[i], previousStart: previousLineStarts[i], previousNumber: i + 1 });
            i += 1;
        } else {
            ops.push({ type: "add", currentLine: currentLines[j], currentStart: currentLineStarts[j], currentNumber: j + 1 });
            j += 1;
        }
    }

    while (i < prevCount) {
        ops.push({ type: "remove", previousLine: previousLines[i], previousStart: previousLineStarts[i], previousNumber: i + 1 });
        i += 1;
    }

    while (j < currCount) {
        ops.push({ type: "add", currentLine: currentLines[j], currentStart: currentLineStarts[j], currentNumber: j + 1 });
        j += 1;
    }

    const rows = [];
    for (let index = 0; index < ops.length; index += 1) {
        const op = ops[index];

        if (op.type === "equal") {
            rows.push({ type: "equal", lineNumber: op.currentNumber, parts: [{ type: "equal", text: op.currentLine, previousStart: op.previousStart, currentStart: op.currentStart }] });
            continue;
        }

        const removed = [];
        const added = [];
        while (ops[index]?.type === "remove") {
            removed.push(ops[index]);
            index += 1;
        }
        while (ops[index]?.type === "add") {
            added.push(ops[index]);
            index += 1;
        }
        index -= 1;

        const pairCount = Math.max(removed.length, added.length);
        for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
            const removedLine = removed[pairIndex];
            const addedLine = added[pairIndex];

            if (removedLine && addedLine) {
                rows.push({
                    type: "modified",
                    lineNumber: addedLine.currentNumber,
                    parts: diffChars(removedLine.previousLine, addedLine.currentLine, removedLine.previousStart, addedLine.currentStart)
                });
            } else if (addedLine) {
                rows.push({
                    type: "added",
                    lineNumber: addedLine.currentNumber,
                    parts: [{ type: "add", text: addedLine.currentLine, currentStart: addedLine.currentStart }]
                });
            } else if (removedLine) {
                rows.push({
                    type: "removed",
                    lineNumber: "",
                    parts: [{ type: "remove", text: removedLine.previousLine, previousStart: removedLine.previousStart }]
                });
            }
        }
    }

    return rows;
};

const normalizeUserKey = (value = "") => String(value || "").replace(/^0x/i, "").replace(/-/g, "").toLowerCase().trim();

const getOperationUserKey = (operation = {}) => (
    normalizeUserKey(operation.userId || operation.id) || String(operation.userName || operation.name || "").trim()
);

const buildOperationAttribution = (previousContent = "", changeOperations = []) => {
    const documentChars = Array.from(previousContent).map((char, previousIndex) => ({
        char,
        previousIndex,
        addedBy: ""
    }));
    const addedByCurrentIndex = new Map();
    const deletedByPreviousIndex = new Map();

    const sortedOperations = Array.isArray(changeOperations)
        ? [...changeOperations].sort((a, b) => {
            const aTime = new Date(a?.editedAt || a?.edited_at || 0).getTime() || 0;
            const bTime = new Date(b?.editedAt || b?.edited_at || 0).getTime() || 0;
            return aTime - bTime;
        })
        : [];

    for (const operation of sortedOperations) {
        const type = operation?.type || operation?.operationType;
        const userKey = getOperationUserKey(operation);
        const index = Math.max(0, Math.min(Number(operation?.index ?? operation?.operationIndex ?? 0) || 0, documentChars.length));

        if (type === "insert") {
            const text = String(operation?.text ?? operation?.operationText ?? "");
            const insertedChars = Array.from(text).map((char) => ({
                char,
                previousIndex: null,
                addedBy: userKey
            }));
            documentChars.splice(index, 0, ...insertedChars);
            continue;
        }

        if (type === "delete") {
            const length = Math.max(0, Number(operation?.length ?? operation?.operationLength ?? 0) || 0);
            const removedChars = documentChars.splice(index, length);

            for (const removedChar of removedChars) {
                if (removedChar.previousIndex !== null && userKey) {
                    deletedByPreviousIndex.set(removedChar.previousIndex, userKey);
                }
            }
        }
    }

    documentChars.forEach((char, currentIndex) => {
        if (char.addedBy) {
            addedByCurrentIndex.set(currentIndex, char.addedBy);
        }
    });

    return { addedByCurrentIndex, deletedByPreviousIndex };
};

const getContributorColor = (userKey, projectId) => (
    userKey ? getUserColor(userKey, projectId) : null
);

const getLatestContributorKey = (contributors = []) => {
    const latest = contributors.reduce((currentLatest, contributor) => {
        if (!currentLatest) return contributor;

        const latestTime = currentLatest.editedAt ? new Date(currentLatest.editedAt).getTime() : 0;
        const contributorTime = contributor.editedAt ? new Date(contributor.editedAt).getTime() : 0;

        return contributorTime >= latestTime ? contributor : currentLatest;
    }, null);

    return latest ? getOperationUserKey(latest) : "";
};

const getSingleContributorKey = (contributors = []) => (
    contributors.length === 1 ? getOperationUserKey(contributors[0]) : ""
);

const getPartUserKey = (part, offset, attribution, fallbackUserKey = "") => {
    if (part.type === "add") {
        const currentIndex = Number(part.currentStart ?? 0) + offset;
        return attribution.addedByCurrentIndex.get(currentIndex) || fallbackUserKey;
    }

    if (part.type === "remove") {
        const previousIndex = Number(part.previousStart ?? 0) + offset;
        return attribution.deletedByPreviousIndex.get(previousIndex) || fallbackUserKey;
    }

    return "";
};

const renderPartSegments = (part, index, options = {}) => {
    const chars = Array.from(part.text || " ");
    const segments = [];
    let currentSegment = null;

    chars.forEach((char, charIndex) => {
        const userKey = getPartUserKey(part, charIndex, options.attribution, part.type === "remove" ? options.fallbackRemoveUserKey : options.fallbackAddUserKey);
        const key = part.type + ":" + userKey;

        if (currentSegment?.key === key) {
            currentSegment.text += char;
        } else {
            currentSegment = { key, type: part.type, userKey, text: char };
            segments.push(currentSegment);
        }
    });

    return segments.map((segment, segmentIndex) => {
        const className = segment.type === "add"
            ? "history-inline-added"
            : segment.type === "remove"
                ? "history-inline-removed"
                : undefined;
        const color = getContributorColor(segment.userKey, options.projectId);
        const style = color && segment.type === "add"
            ? { backgroundColor: hexToRgba(color, 0.22) }
            : color && segment.type === "remove"
                ? { color, textDecorationColor: color }
                : undefined;

        return (
            <span key={String(index) + "-" + String(segmentIndex) + "-" + segment.key} className={className} style={style}>
                {segment.text || " "}
            </span>
        );
    });
};

const renderParts = (parts, options = {}) => parts.flatMap((part, index) => renderPartSegments(part, index, options));

const getRowBorderColor = (parts = [], options = {}) => {
    for (const part of parts) {
        if (part.type !== "add" && part.type !== "remove") continue;

        const fallback = part.type === "remove" ? options.fallbackRemoveUserKey : options.fallbackAddUserKey;
        const userKey = getPartUserKey(part, 0, options.attribution, fallback);
        const color = getContributorColor(userKey, options.projectId);
        if (color) return color;
    }

    return null;
};

function InlineHistoryDiffViewer({ previousContent, currentContent, contributors = [], changeOperations = [], projectId }) {
    const rows = buildLineRows(previousContent, currentContent);
    const attribution = buildOperationAttribution(previousContent, changeOperations);
    const fallbackAddUserKey = getSingleContributorKey(contributors);
    const fallbackRemoveUserKey = getLatestContributorKey(contributors) || fallbackAddUserKey;

    return (
        <div className="history-inline-code-viewer" role="region" aria-label="Edited file diff">
            {rows.map((row, index) => {
                const renderOptions = {
                    attribution,
                    projectId,
                    fallbackAddUserKey,
                    fallbackRemoveUserKey
                };
                const borderColor = getRowBorderColor(row.parts, renderOptions);

                return (
                    <div
                        key={String(index) + "-" + row.lineNumber}
                        className={"history-inline-code-row history-inline-code-row-" + row.type}
                        style={borderColor ? { borderLeftColor: borderColor } : undefined}
                    >
                        <div className="history-inline-code-gutter">{row.lineNumber}</div>
                        <pre className="history-inline-code-line">{renderParts(row.parts, renderOptions)}</pre>
                    </div>
                );
            })}
        </div>
    );
}

function HistoryEditorUI({
    selectedHistory,
    activeFile,
    projectId,
    isLoading = false,
    error = ""
}) {
    const isInlineEditedFile = activeFile?.label === "EDITED" && typeof activeFile?.previousContent === "string";

    return (
        <main className="editor-section bg-white">
            <div className="p-2 bg-light border-bottom small d-flex justify-content-between align-items-center">
                <span>
                    Viewing Version:{" "}
                    <strong>
                        {selectedHistory?.createdAt
                            ? new Date(selectedHistory.createdAt).toLocaleString()
                            : "No version selected"}
                    </strong>
                </span>

                <span className="badge bg-secondary text-dark px-2 py-1">
                    {activeFile?.name || "No file selected"}
                </span>
            </div>

            <div className="flex-grow-1 history-editor-body">
                {isLoading ? (
                    <div className="h-100 d-flex align-items-center justify-content-center text-muted">
                        파일 내용을 불러오는 중입니다...
                    </div>
                ) : error ? (
                    <div className="h-100 d-flex align-items-center justify-content-center text-danger">
                        {error}
                    </div>
                ) : activeFile?.isCodeViewerUnsupported ? (
                    <div className="h-100 d-flex align-items-center justify-content-center text-muted">
                        이미지/PDF 파일은 히스토리 코드 뷰어에서 표시하지 않습니다.
                    </div>
                ) : isInlineEditedFile ? (
                    <InlineHistoryDiffViewer
                        previousContent={activeFile.previousContent}
                        currentContent={activeFile.content || ""}
                        contributors={activeFile.contributors || selectedHistory?.contributors || []}
                        changeOperations={activeFile.changeOperations || []}
                        projectId={projectId}
                    />
                ) : activeFile ? (
                    <Editor
                        key={activeFile.id}
                        height="100%"
                        theme="vs"
                        defaultLanguage="latex"
                        value={activeFile.content || ""}
                        options={{
                            readOnly: true,
                            fontSize: 14,
                            minimap: { enabled: false },
                            automaticLayout: true,
                            scrollBeyondLastLine: false,
                            glyphMargin: true,
                            lineDecorationsWidth: 10
                        }}
                    />
                ) : (
                    <div className="h-100 d-flex align-items-center justify-content-center text-muted">
                        파일을 선택해주세요.
                    </div>
                )}
            </div>
        </main>
    );
}

export default HistoryEditorUI;
