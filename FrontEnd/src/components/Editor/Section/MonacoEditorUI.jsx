/**
 * =================================================================
 * [Component] Monaco Editor UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React from "react";
import Editor from "@monaco-editor/react";

const headingSnippets = [
    { label: "Part", template: "\\part{${selected}${cursor}}" },
    { label: "Chapter", template: "\\chapter{${selected}${cursor}}" },
    { label: "Section", template: "\\section{${selected}${cursor}}" },
    { label: "Subsection", template: "\\subsection{${selected}${cursor}}" },
    { label: "Subsubsection", template: "\\subsubsection{${selected}${cursor}}" }
];

const environmentSnippets = [
    { label: "Figure", template: "\\begin{figure}[htbp]\n    \\centering\n    \\includegraphics[width=0.8\\textwidth]{${cursor}}\n    \\caption{}\n    \\label{fig:}\n\\end{figure}" },
    { label: "Table", template: "\\begin{table}[htbp]\n    \\centering\n    \\begin{tabular}{|c|c|}\n        \\hline\n        ${selected}${cursor} &  \\\\n        \\hline\n    \\end{tabular}\n    \\caption{}\n    \\label{tab:}\n\\end{table}" },
    { label: "Equation", template: "\\begin{equation}\n    ${selected}${cursor}\n\\end{equation}" },
    { label: "Align", template: "\\begin{align}\n    ${selected}${cursor} &= \\\\n\\end{align}" },
    { label: "Itemize", template: "\\begin{itemize}\n    \\item ${selected}${cursor}\n\\end{itemize}" },
    { label: "Enumerate", template: "\\begin{enumerate}\n    \\item ${selected}${cursor}\n\\end{enumerate}" },
    { label: "Description", template: "\\begin{description}\n    \\item[${cursor}] ${selected}\n\\end{description}" },
    { label: "Matrix", template: "\\begin{bmatrix}\n    ${selected}${cursor} &  \\\\n     & \n\\end{bmatrix}" }
];

const quickButtons = [
    { label: "B", title: "Bold", className: "latex-toolbar-bold", template: "\\textbf{${selected}${cursor}}" },
    { label: "I", title: "Italic", className: "latex-toolbar-italic", template: "\\textit{${selected}${cursor}}" },
    { label: "x^2", title: "Superscript", template: "${selected}^{${cursor}}" },
    { label: "x_2", title: "Subscript", template: "${selected}_{${cursor}}" },
    { label: "omega", title: "Greek omega", template: "\\omega" },
    { label: "sum", title: "Sum", template: "\\sum_{${cursor}}^{}" },
    { label: "sqrt", title: "Square root", template: "\\sqrt{${selected}${cursor}}" },
    { label: "a/b", title: "Fraction", template: "\\frac{${selected}${cursor}}{}" },
    { label: "link", title: "Hyperlink", template: "\\href{${cursor}}{${selected}}" },
    { label: "+", title: "Comment", template: "\\todo{${selected}${cursor}}" },
    { label: "tag", title: "Label", template: "\\label{${cursor}}" },
    { label: "cite", title: "Citation", template: "\\cite{${cursor}}" },
    { label: "img", title: "Image include", template: "\\includegraphics[width=0.8\\textwidth]{${cursor}}" },
    { label: "tbl", title: "Tabular", template: "\\begin{tabular}{|c|c|}\n    \\hline\n    ${selected}${cursor} &  \\\\n    \\hline\n\\end{tabular}" },
    { label: "list", title: "Bullet list", template: "\\begin{itemize}\n    \\item ${selected}${cursor}\n\\end{itemize}" }
];

function MonacoEditorUI({
    activeFileId,
    fileContent,
    isFileContentLoaded = true,
    handleEditorDidMount,
    insertSnippet,
    editorOptions,
    readOnly = false
}) {
    const onInternalEditorMount = (editor, monaco) => {
        if (handleEditorDidMount) {
            handleEditorDidMount(editor, monaco);
        }
    };

    const applySnippet = (template) => {
        if (!readOnly && insertSnippet) {
            insertSnippet(template);
        }
    };

    return (
        <main className="editor-section">
            <div className="editor-toolbar latex-editor-toolbar border-bottom" aria-label="LaTeX toolbar">
                <div className="latex-toolbar-group">
                    <button type="button" className="latex-toolbar-button" title="Undo" data-tooltip="Undo" disabled={readOnly} onClick={() => applySnippet("__COMMAND__:undo")}>↶</button>
                    <button type="button" className="latex-toolbar-button" title="Redo" data-tooltip="Redo" disabled={readOnly} onClick={() => applySnippet("__COMMAND__:redo")}>↷</button>
                </div>

                <div className="latex-toolbar-group">
                    <div className="latex-toolbar-select-wrap" data-tooltip="Heading">
                        <select className="latex-toolbar-select" title="Heading" disabled={readOnly} defaultValue="" onChange={(event) => {
                            const snippet = headingSnippets.find(item => item.label === event.target.value);
                            if (snippet) applySnippet(snippet.template);
                            event.target.value = "";
                        }}>
                            <option value="">T</option>
                            {headingSnippets.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                        </select>
                    </div>

                    {quickButtons.map((button) => (
                        <button
                            key={button.title}
                            type="button"
                            className={"latex-toolbar-button " + (button.className || "")}
                            title={button.title}
                            data-tooltip={button.title}
                            disabled={readOnly}
                            onClick={() => applySnippet(button.template)}
                        >
                            {button.label}
                        </button>
                    ))}
                </div>

                <div className="latex-toolbar-group">
                    <div className="latex-toolbar-select-wrap latex-toolbar-wide-select-wrap" data-tooltip="Insert environment">
                        <select className="latex-toolbar-select latex-toolbar-wide-select" title="Insert environment" disabled={readOnly} defaultValue="" onChange={(event) => {
                            const snippet = environmentSnippets.find(item => item.label === event.target.value);
                            if (snippet) applySnippet(snippet.template);
                            event.target.value = "";
                        }}>
                            <option value="">Env</option>
                            {environmentSnippets.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="editor-wrapper-inner">
                {!activeFileId ? (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">파일을 선택해주세요.</div>
                ) : !isFileContentLoaded ? (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">파일 내용을 불러오는 중입니다...</div>
                ) : (
                    <Editor
                        key={activeFileId}
                        height="100%"
                        theme="vs"
                        defaultLanguage="latex"
                        defaultValue={fileContent || ""}
                        onMount={onInternalEditorMount}
                        options={{
                            ...editorOptions,
                            readOnly,
                            domReadOnly: readOnly,
                            minimap: { enabled: true },
                            fontSize: 14,
                            renderLineHighlight: "all",
                            backgroundColor: "#ffffff"
                        }}
                    />
                )}
            </div>
        </main>
    );
}

export default MonacoEditorUI;
