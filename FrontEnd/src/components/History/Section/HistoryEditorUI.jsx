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

const diffChars = (previousLine = "", currentLine = "") => {
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
            parts.push({ type: "equal", text: currentChars[j] });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            parts.push({ type: "remove", text: previousChars[i] });
            i += 1;
        } else {
            parts.push({ type: "add", text: currentChars[j] });
            j += 1;
        }
    }

    while (i < rows) {
        parts.push({ type: "remove", text: previousChars[i] });
        i += 1;
    }

    while (j < cols) {
        parts.push({ type: "add", text: currentChars[j] });
        j += 1;
    }

    return compactParts(parts);
};

const buildLineRows = (previousContent = "", currentContent = "") => {
    const previousLines = splitLines(previousContent);
    const currentLines = splitLines(currentContent);
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
            ops.push({ type: "equal", previousLine: previousLines[i], currentLine: currentLines[j], currentNumber: j + 1 });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push({ type: "remove", previousLine: previousLines[i], previousNumber: i + 1 });
            i += 1;
        } else {
            ops.push({ type: "add", currentLine: currentLines[j], currentNumber: j + 1 });
            j += 1;
        }
    }

    while (i < prevCount) {
        ops.push({ type: "remove", previousLine: previousLines[i], previousNumber: i + 1 });
        i += 1;
    }

    while (j < currCount) {
        ops.push({ type: "add", currentLine: currentLines[j], currentNumber: j + 1 });
        j += 1;
    }

    const rows = [];
    for (let index = 0; index < ops.length; index += 1) {
        const op = ops[index];

        if (op.type === "equal") {
            rows.push({ type: "equal", lineNumber: op.currentNumber, parts: [{ type: "equal", text: op.currentLine }] });
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
                    parts: diffChars(removedLine.previousLine, addedLine.currentLine)
                });
            } else if (addedLine) {
                rows.push({
                    type: "added",
                    lineNumber: addedLine.currentNumber,
                    parts: [{ type: "add", text: addedLine.currentLine }]
                });
            } else if (removedLine) {
                rows.push({
                    type: "removed",
                    lineNumber: "",
                    parts: [{ type: "remove", text: removedLine.previousLine }]
                });
            }
        }
    }

    return rows;
};

const renderParts = (parts, color) => parts.map((part, index) => {
    const className = part.type === "add"
        ? "history-inline-added"
        : part.type === "remove"
            ? "history-inline-removed"
            : undefined;
    const style = color && part.type === "add"
        ? { backgroundColor: hexToRgba(color, 0.22) }
        : color && part.type === "remove"
            ? { color, textDecorationColor: color }
            : undefined;

    return (
        <span key={String(index) + "-" + part.type} className={className} style={style}>
            {part.text || " "}
        </span>
    );
});

function InlineHistoryDiffViewer({ previousContent, currentContent, contributors = [], projectId }) {
    const rows = buildLineRows(previousContent, currentContent);
    const colorContributors = contributors.length > 0
        ? contributors
        : [{ id: "anonymous", name: "User" }];
    let changedRowIndex = 0;

    return (
        <div className="history-inline-code-viewer" role="region" aria-label="Edited file diff">
            {rows.map((row, index) => {
                const isChangedRow = row.type !== "equal";
                const contributor = isChangedRow
                    ? colorContributors[changedRowIndex % colorContributors.length]
                    : null;
                const color = contributor
                    ? getUserColor(contributor.id || contributor.name, projectId)
                    : null;

                if (isChangedRow) changedRowIndex += 1;

                return (
                    <div
                        key={String(index) + "-" + row.lineNumber}
                        className={"history-inline-code-row history-inline-code-row-" + row.type}
                        style={color ? { borderLeftColor: color } : undefined}
                    >
                        <div className="history-inline-code-gutter">{row.lineNumber}</div>
                        <pre className="history-inline-code-line">{renderParts(row.parts, color)}</pre>
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
                ) : activeFile?.isImage ? (
                    <div className="h-100 d-flex align-items-center justify-content-center text-muted">
                        이미지 파일은 히스토리 코드 뷰어에서 표시하지 않습니다.
                    </div>
                ) : isInlineEditedFile ? (
                    <InlineHistoryDiffViewer
                        previousContent={activeFile.previousContent}
                        currentContent={activeFile.content || ""}
                        contributors={activeFile.contributors || selectedHistory?.contributors || []}
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
