/**
 * =================================================================
 * [Utility] LaTeX Sanitize Pipeline
 * 설명: LaTeX 입력 정리, 위험 구문 완화 및 sanitize 로그 생성을 처리함
 * =================================================================
 */
/* ---------------------------------------------------------
 * SECTION 1: Sanitize Policy Overview
 * - #, &, _ 문자는 LaTeX 문맥을 고려해 필요한 경우에만 escape한다.
 * - URL, 파일 경로, verbatim 계열 환경, 수식/주석 영역은 원문을 보존한다.
 * - brace와 begin/end 환경 균형을 검사해 컴파일 실패 가능성이 큰 줄을 완화한다.
 * --------------------------------------------------------- */
const fs = require('fs')
const path = require('path')

function sanitizeTexFile(inputPath, outputPath, logPath) {
    const originalText = fs.readFileSync(inputPath, 'utf-8')

    const logs = []
    let text = originalText

    text = escapeSpecialChars(text, logs)
    text = removeBrokenCommands(text, logs)
    text = commentUnbalancedBraceLines(text, logs)
    text = fixBeginEnd(text, logs)

    fs.writeFileSync(outputPath, text, 'utf-8')
    fs.writeFileSync(logPath, formatSanitizeLog(logs), 'utf-8')

    return {
        sanitizedPath: outputPath,
        logPath,
        logs
    }
}

const noEscapeCommands = new Set([
    'label',
    'ref',
    'pageref',
    'eqref',
    'cite',
    'citep',
    'citet',
    'includegraphics',
    'input',
    'include',
    'url',
    'href',
    'item'
])

const noEscapeEnvironments = new Set([
    'verbatim',
    'lstlisting',
    'minted'
])

// 실제 텍스트 영역에서만 자동 escape할 문자.
// %, $는 LaTeX 문법과 충돌 가능성이 커서 자동 escape하지 않는다.
const autoEscapeTargets = new Set(['#', '&', '_'])

function escapeSpecialChars(text, logs) {
    const lines = text.split('\n')
    const result = []

    let inNoEscapeEnvironment = false
    let currentNoEscapeEnv = null
    let mathState = {
        inDollarMath: false,
        inDisplayDollarMath: false,
        inParenMath: false,
        inBracketMath: false
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]
        const trimmed = line.trim()

        if (trimmed.startsWith('%')) {
            result.push(line)
            continue
        }

        const beginNoEscapeEnv = findBeginNoEscapeEnvironment(line)
        const endNoEscapeEnv = findEndNoEscapeEnvironment(line, currentNoEscapeEnv)

        if (inNoEscapeEnvironment) {
            result.push(line)

            if (endNoEscapeEnv) {
                inNoEscapeEnvironment = false
                currentNoEscapeEnv = null
            }

            continue
        }

        if (beginNoEscapeEnv) {
            result.push(line)
            inNoEscapeEnvironment = true
            currentNoEscapeEnv = beginNoEscapeEnv
            continue
        }

        const protectedRanges = findNoEscapeCommandRanges(line)
        const escapedLine = escapeLineWithProtectedRanges(
            line,
            protectedRanges,
            lineIndex,
            logs,
            mathState
        )

        result.push(escapedLine)
    }

    return result.join('\n')
}

function findNoEscapeCommandRanges(line) {
    const ranges = []
    const commandRegex = /\\([a-zA-Z]+)\s*(?:\[[^\]]*\])?\s*\{/g
    let match

    while ((match = commandRegex.exec(line)) !== null) {
        const commandName = match[1]

        if (!noEscapeCommands.has(commandName)) {
            continue
        }

        const openBraceIndex = line.indexOf('{', match.index)

        if (openBraceIndex === -1) {
            continue
        }

        const closeBraceIndex = findMatchingBrace(line, openBraceIndex)

        if (closeBraceIndex === -1) {
            continue
        }

        ranges.push({
            start: openBraceIndex + 1,
            end: closeBraceIndex
        })

        // \href{url}{text}에서는 첫 번째 URL 인자만 보호한다.
        // 두 번째 표시 텍스트는 일반 LaTeX 텍스트처럼 처리한다.
    }

    return ranges
}

function escapeLineWithProtectedRanges(line, protectedRanges, lineIndex, logs, mathState) {
    let newLine = ''
    const commentStart = findCommentStart(line)
    const mathRanges = findMathRanges(line, mathState)
    const allProtectedRanges = protectedRanges.concat(mathRanges)

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]

        if (commentStart !== -1 && i >= commentStart) {
            newLine += line.slice(i)
            break
        }

        if (
            autoEscapeTargets.has(ch) &&
            !isEscaped(line, i) &&
            !isIndexInRanges(i, allProtectedRanges)
        ) {
            newLine += '\\' + ch

            logs.push({
                line: lineIndex + 1,
                type: 'escape-special-char',
                message: `Escaped '${ch}'`
            })
        } else {
            newLine += ch
        }
    }

    return newLine
}

function findMathRanges(line, mathState) {
    const ranges = []
    const commentStart = findCommentStart(line)
    const scanEnd = commentStart === -1 ? line.length : commentStart

    let dollarStart = null
    let displayStart = mathState.inDisplayDollarMath ? 0 : null
    let parenStart = mathState.inParenMath ? 0 : null
    let bracketStart = mathState.inBracketMath ? 0 : null

    for (let i = 0; i < scanEnd; i++) {
        if (isEscaped(line, i)) {
            continue
        }

        if (line.startsWith('$$', i)) {
            if (mathState.inDisplayDollarMath) {
                ranges.push({ start: displayStart ?? 0, end: i + 2 })
                mathState.inDisplayDollarMath = false
                displayStart = null
            } else {
                mathState.inDisplayDollarMath = true
                displayStart = i
            }
            i++
            continue
        }

        if (line.startsWith('\\(', i)) {
            mathState.inParenMath = true
            parenStart = i
            i++
            continue
        }

        if (line.startsWith('\\)', i)) {
            if (mathState.inParenMath) {
                ranges.push({ start: parenStart ?? 0, end: i + 2 })
            }
            mathState.inParenMath = false
            parenStart = null
            i++
            continue
        }

        if (line.startsWith('\\[', i)) {
            mathState.inBracketMath = true
            bracketStart = i
            i++
            continue
        }

        if (line.startsWith('\\]', i)) {
            if (mathState.inBracketMath) {
                ranges.push({ start: bracketStart ?? 0, end: i + 2 })
            }
            mathState.inBracketMath = false
            bracketStart = null
            i++
            continue
        }

        // 일반 $...$ 인라인 수식은 같은 줄 안에서 짝이 맞는 경우에만 보호한다.
        // 짝이 맞지 않는 $는 문맥 판단이 위험하므로 escape도, 수식 보호도 하지 않는다.
        if (line[i] === '$' && !mathState.inDisplayDollarMath) {
            if (dollarStart === null) {
                dollarStart = i
            } else {
                ranges.push({ start: dollarStart, end: i + 1 })
                dollarStart = null
            }
        }
    }

    if (mathState.inDisplayDollarMath && displayStart !== null) {
        ranges.push({ start: displayStart, end: scanEnd })
    }

    if (mathState.inParenMath && parenStart !== null) {
        ranges.push({ start: parenStart, end: scanEnd })
    }

    if (mathState.inBracketMath && bracketStart !== null) {
        ranges.push({ start: bracketStart, end: scanEnd })
    }

    return ranges
}

function findCommentStart(line) {
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '%' && !isEscaped(line, i)) {
            return i
        }
    }

    return -1
}

function isIndexInRanges(index, ranges) {
    return ranges.some(range => index >= range.start && index < range.end)
}

function findMatchingBrace(line, openBraceIndex) {
    let depth = 0
    const commentStart = findCommentStart(line)

    for (let i = openBraceIndex; i < line.length; i++) {
        if (commentStart !== -1 && i >= commentStart) {
            break
        }

        const ch = line[i]

        if (ch === '{' && !isEscaped(line, i)) {
            depth++
        }

        if (ch === '}' && !isEscaped(line, i)) {
            depth--

            if (depth === 0) {
                return i
            }
        }
    }

    return -1
}

function findBeginNoEscapeEnvironment(line) {
    const match = line.match(/\\begin\{([^}]+)\}/)

    if (!match) {
        return null
    }

    const envName = match[1]

    if (noEscapeEnvironments.has(envName)) {
        return envName
    }

    return null
}

function findEndNoEscapeEnvironment(line, currentEnv) {
    if (!currentEnv) {
        return false
    }

    const regex = new RegExp(`\\\\end\\{${escapeRegExp(currentEnv)}\\}`)
    return regex.test(line)
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const structuralCommands = new Set([
    'part',
    'chapter',
    'section',
    'subsection',
    'subsubsection',
    'paragraph',
    'subparagraph',
    'begin',
    'end',
    'caption',
    'includegraphics',
    'input',
    'include',
    'documentclass',
    'usepackage',
    'title',
    'author',
    'date'
])

function removeBrokenCommands(text, logs) {
    const lines = text.split('\n')
    const result = [...lines]

    let openCommand = null

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (line.trim().startsWith('%')) {
            continue
        }

        const commandMatch = line.match(/^\s*\\([a-zA-Z]+)\s*(?:\[.*?\])?\s*\{/)
        const balance = countBraceDeltaOutsideComment(line)

        if (
            openCommand &&
            commandMatch &&
            structuralCommands.has(commandMatch[1]) &&
            openCommand.balance > 0
        ) {
            for (let j = openCommand.startLine; j < i; j++) {
                if (!result[j].trim().startsWith('%')) {
                    result[j] = `% [SANITIZED: broken command] ${result[j]}`
                }
            }

            logs.push({
                line: openCommand.startLine + 1,
                type: 'broken-command',
                message: `Command \\${openCommand.name} was not closed before \\${commandMatch[1]} started.`
            })

            openCommand = null
        }

        if (commandMatch && balance > 0) {
            openCommand = {
                name: commandMatch[1],
                startLine: i,
                balance
            }
        } else if (openCommand) {
            openCommand.balance += balance

            if (openCommand.balance <= 0) {
                openCommand = null
            }
        }
    }

    return result.join('\n')
}

// 기존 이름은 유지하되, 동작은 "줄 단위 close > open" 검사가 아니라
// 문서 흐름상 실제 초과 닫힘만 잡도록 수정한다.
function commentUnbalancedBraceLines(text, logs) {
    const lines = text.split('\n')
    const result = [...lines]
    let depth = 0

    for (let i = 0; i < result.length; i++) {
        const line = result[i]
        const trimmed = line.trim()

        if (trimmed.startsWith('%')) {
            continue
        }

        const deltaResult = getBraceDeltaWithMinimum(line, depth)

        if (deltaResult.invalid) {
            result[i] = `% [SANITIZED: unbalanced brace] ${line}`

            logs.push({
                line: i + 1,
                type: 'brace-balance',
                message: 'Line has an extra closing brace in document context.'
            })

            continue
        }

        depth = deltaResult.depth
    }

    return result.join('\n')
}

function getBraceDeltaWithMinimum(line, startDepth) {
    let depth = startDepth
    const commentStart = findCommentStart(line)

    for (let i = 0; i < line.length; i++) {
        if (commentStart !== -1 && i >= commentStart) {
            break
        }

        const ch = line[i]

        if (ch === '{' && !isEscaped(line, i)) {
            depth++
            continue
        }

        if (ch === '}' && !isEscaped(line, i)) {
            depth--

            if (depth < 0) {
                return {
                    invalid: true,
                    depth: startDepth
                }
            }
        }
    }

    return {
        invalid: false,
        depth
    }
}

function fixBeginEnd(text, logs) {
    const lines = text.split('\n')
    const result = [...lines]

    const stack = []

    for (let i = 0; i < result.length; i++) {
        const line = result[i]

        if (line.trim().startsWith('%')) {
            continue
        }

        const tokens = []
        const scanText = stripCommentPart(line)

        for (const match of scanText.matchAll(/\\begin\{([^}]+)\}/g)) {
            tokens.push({
                type: 'begin',
                env: match[1],
                index: match.index
            })
        }

        for (const match of scanText.matchAll(/\\end\{([^}]+)\}/g)) {
            tokens.push({
                type: 'end',
                env: match[1],
                index: match.index
            })
        }

        tokens.sort((a, b) => a.index - b.index)

        for (const token of tokens) {
            if (token.type === 'begin') {
                stack.push({
                    env: token.env,
                    line: i
                })
                continue
            }

            const env = token.env

            if (stack.length > 0 && stack[stack.length - 1].env === env) {
                stack.pop()
                continue
            }

            const foundIndex = stack.findLastIndex(item => item.env === env)

            if (foundIndex !== -1) {
                while (stack.length - 1 > foundIndex) {
                    const missing = stack.pop()

                    result.splice(i, 0,
                        `% [SANITIZED: added missing end before line ${i + 1} for line ${missing.line + 1}]`,
                        `\\end{${missing.env}}`
                    )

                    logs.push({
                        line: missing.line + 1,
                        type: 'begin-end',
                        message: `Missing \\end{${missing.env}} was added before \\end{${env}}.`
                    })

                    i += 2
                }

                stack.pop()
            } else {
                result[i] = `% [SANITIZED: unmatched end] ${result[i]}`

                logs.push({
                    line: i + 1,
                    type: 'begin-end',
                    message: `Unmatched \\end{${env}} was commented out.`
                })
            }
        }
    }

    while (stack.length > 0) {
        const item = stack.pop()

        result.push(`% [SANITIZED: added missing end for line ${item.line + 1}]`)
        result.push(`\\end{${item.env}}`)

        logs.push({
            line: item.line + 1,
            type: 'begin-end',
            message: `Missing \\end{${item.env}} was added.`
        })
    }

    return result.join('\n')
}

function countBraceDeltaOutsideComment(line) {
    let delta = 0
    const commentStart = findCommentStart(line)

    for (let i = 0; i < line.length; i++) {
        if (commentStart !== -1 && i >= commentStart) {
            break
        }

        if (line[i] === '{' && !isEscaped(line, i)) {
            delta++
        } else if (line[i] === '}' && !isEscaped(line, i)) {
            delta--
        }
    }

    return delta
}

function countUnescapedChar(line, target) {
    let count = 0
    const commentStart = findCommentStart(line)

    for (let i = 0; i < line.length; i++) {
        if (commentStart !== -1 && i >= commentStart) {
            break
        }

        if (line[i] === target && !isEscaped(line, i)) {
            count++
        }
    }

    return count
}

function stripCommentPart(line) {
    const commentStart = findCommentStart(line)
    return commentStart === -1 ? line : line.slice(0, commentStart)
}

function isEscaped(text, index) {
    let backslashCount = 0

    for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
        backslashCount++
    }

    return backslashCount % 2 === 1
}

function formatSanitizeLog(logs) {
    if (logs.length === 0) {
        return '[SANITIZE LOG]\nNo sanitize actions were applied.\n'
    }

    const lines = ['[SANITIZE LOG]']

    for (const log of logs) {
        lines.push(
            `line ${log.line} | ${log.type} | ${log.message}`
        )
    }

    return lines.join('\n') + '\n'
}

if (require.main === module) {
    const [inputPath, outputPath, logPath] = process.argv.slice(2)

    if (!inputPath || !outputPath || !logPath) {
        console.error('Usage: node sanitize.js <input.tex> <output.tex> <sanitize.log>')
        process.exit(1)
    }

    const outputDir = path.dirname(outputPath)
    const logDir = path.dirname(logPath)

    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(logDir, { recursive: true })

    const result = sanitizeTexFile(inputPath, outputPath, logPath)

    console.log(JSON.stringify({
        success: true,
        sanitizedPath: result.sanitizedPath,
        logPath: result.logPath,
        actionCount: result.logs.length
    }, null, 2))
}

module.exports = {
    sanitizeTexFile,
    escapeSpecialChars,
    removeBrokenCommands,
    commentUnbalancedBraceLines,
    fixBeginEnd,
    formatSanitizeLog
}
/*
const fs = require('fs')
const path = require('path')

// 전체 Sanitize 파이프라인을 실행하는 메인 함수
// 입력 .tex 파일을 읽고, 각 sanitize 단계를 적용한 뒤 결과 .tex와 로그 파일을 저장한다.
function sanitizeTexFile(inputPath, outputPath, logPath) {
    const originalText = fs.readFileSync(inputPath, 'utf-8')

    const logs = []
    let text = originalText

    text = escapeSpecialChars(text, logs)
    text = removeBrokenCommands(text, logs)
    text = commentUnbalancedBraceLines(text, logs)
    text = fixBeginEnd(text, logs)

    fs.writeFileSync(outputPath, text, 'utf-8')
    fs.writeFileSync(logPath, formatSanitizeLog(logs), 'utf-8')

    return {
        sanitizedPath: outputPath,
        logPath,
        logs
    }
}

// 특수문자 escape를 적용하지 않을 명령어 목록
// 파일 경로 또는 URL처럼 원문이 유지되어야 하는 인자를 가진 명령어들이다.
const noEscapeCommands = new Set([
    'includegraphics',
    'input',
    'include',
    'url',
    'href'
])

// 특수문자 escape를 적용하지 않을 환경 목록
// 코드나 원문을 그대로 보여주는 환경이므로 내부 내용을 수정하지 않는다.
const noEscapeEnvironments = new Set([
    'verbatim',
    'lstlisting',
    'minted'
])

// 특수문자 escape 단계
// %, #, $, &, _ 문자를 LaTeX에서 안전하게 사용할 수 있도록 escape한다.
// 단, 이미 escape된 문자와 보호 범위에 포함된 문자는 수정하지 않는다.
function escapeSpecialChars(text, logs) {
    const lines = text.split('\n')
    const result = []

    let inNoEscapeEnvironment = false
    let currentNoEscapeEnv = null

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]
        const trimmed = line.trim()

        if (trimmed.startsWith('%')) {
            result.push(line)
            continue
        }

        const beginNoEscapeEnv = findBeginNoEscapeEnvironment(line)
        const endNoEscapeEnv = findEndNoEscapeEnvironment(line, currentNoEscapeEnv)

        if (inNoEscapeEnvironment) {
            result.push(line)

            if (endNoEscapeEnv) {
                inNoEscapeEnvironment = false
                currentNoEscapeEnv = null
            }

            continue
        }

        if (beginNoEscapeEnv) {
            result.push(line)
            inNoEscapeEnvironment = true
            currentNoEscapeEnv = beginNoEscapeEnv
            continue
        }

        const protectedRanges = findNoEscapeCommandRanges(line)
        const escapedLine = escapeLineWithProtectedRanges(
            line,
            protectedRanges,
            lineIndex,
            logs
        )

        result.push(escapedLine)
    }

    return result.join('\n')
}

// 한 줄 안에서 escape 예외 처리할 명령어 인자 범위를 찾는다.
// 예: \includegraphics{...}, \input{...}, \url{...}, \href{URL}{text}의 URL 부분
function findNoEscapeCommandRanges(line) {
    const ranges = []

    const commandRegex = /\\([a-zA-Z]+)\s*(?:\[[^\]]*\])?\s*\{/g
    let match

    while ((match = commandRegex.exec(line)) !== null) {
        const commandName = match[1]

        if (!noEscapeCommands.has(commandName)) {
            continue
        }

        const openBraceIndex = line.indexOf('{', match.index)

        if (openBraceIndex === -1) {
            continue
        }

        const closeBraceIndex = findMatchingBrace(line, openBraceIndex)

        if (closeBraceIndex === -1) {
            continue
        }

        ranges.push({
            start: openBraceIndex + 1,
            end: closeBraceIndex
        })

    }

    return ranges
}

// 보호 범위를 제외하고 한 줄의 특수문자를 escape한다.
// 실제로 변경이 발생하면 logs 배열에 처리 내역을 추가한다.
function escapeLineWithProtectedRanges(line, protectedRanges, lineIndex, logs) {
    const targets = new Set(['%', '#', '$', '&', '_'])
    let newLine = ''

    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        const prev = i > 0 ? line[i - 1] : ''

        if (
            targets.has(ch) &&
            prev !== '\\' &&
            !isIndexInRanges(i, protectedRanges)
        ) {
            newLine += '\\' + ch

            logs.push({
                line: lineIndex + 1,
                type: 'escape-special-char',
                message: `Escaped '${ch}'`
            })
        } else {
            newLine += ch
        }
    }

    return newLine
}

// 특정 문자 위치가 escape 예외 범위에 포함되는지 확인한다.
function isIndexInRanges(index, ranges) {
    return ranges.some(range => index >= range.start && index < range.end)
}

// 특정 여는 brace 위치에 대응되는 닫는 brace 위치를 찾는다.
// 중첩 brace를 고려하며, escape된 brace는 무시한다.
function findMatchingBrace(line, openBraceIndex) {
    let depth = 0

    for (let i = openBraceIndex; i < line.length; i++) {
        const ch = line[i]
        const prev = i > 0 ? line[i - 1] : ''

        if (ch === '{' && prev !== '\\') {
            depth++
        }

        if (ch === '}' && prev !== '\\') {
            depth--

            if (depth === 0) {
                return i
            }
        }
    }

    return -1
}

// 현재 줄에서 escape 예외 환경이 시작되는지 확인한다.
function findBeginNoEscapeEnvironment(line) {
    const match = line.match(/\\begin\{([^}]+)\}/)

    if (!match) {
        return null
    }

    const envName = match[1]

    if (noEscapeEnvironments.has(envName)) {
        return envName
    }

    return null
}

// 현재 줄에서 escape 예외 환경이 종료되는지 확인한다.
function findEndNoEscapeEnvironment(line, currentEnv) {
    if (!currentEnv) {
        return false
    }

    const regex = new RegExp(`\\\\end\\{${escapeRegExp(currentEnv)}\\}`)

    return regex.test(line)
}

// 문자열을 RegExp 패턴에 안전하게 넣기 위해 특수문자를 escape한다.
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 깨진 명령어 판단에 사용할 구조형 명령어 목록
// 열린 명령어가 닫히기 전에 아래 명령어가 새로 시작되면 이전 명령어를 깨진 것으로 본다.
const structuralCommands = new Set([
    'part',
    'chapter',
    'section',
    'subsection',
    'subsubsection',
    'paragraph',
    'subparagraph',
    'begin',
    'end',
    'caption',
    'includegraphics',
    'input',
    'include',
    'documentclass',
    'usepackage',
    'title',
    'author',
    'date'
])

// 깨진 명령어 제거 단계
// 명령어 인자가 닫히기 전에 새로운 구조형 명령어가 시작되면,
// 이전 명령어 구간을 주석 처리하여 컴파일 실패 가능성을 줄인다.
function removeBrokenCommands(text, logs) {
    const lines = text.split('\n')
    const result = [...lines]

    let openCommand = null

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        const commandMatch = line.match(/^\s*\\([a-zA-Z]+)\s*(?:\[.*?\])?\s*\{/)

        if (
            openCommand &&
            commandMatch &&
            structuralCommands.has(commandMatch[1])
        ) {
            for (let j = openCommand.startLine; j < i; j++) {
                if (!result[j].trim().startsWith('%')) {
                    result[j] = `% [SANITIZED: broken command] ${result[j]}`
                }
            }

            logs.push({
                line: openCommand.startLine + 1,
                type: 'broken-command',
                message: `Command \\${openCommand.name} was not closed before \\${commandMatch[1]} started.`
            })

            openCommand = null
        }

        const balance = countUnescapedChar(line, '{') - countUnescapedChar(line, '}')

        if (commandMatch && balance > 0) {
            openCommand = {
                name: commandMatch[1],
                startLine: i,
                balance
            }
        } else if (openCommand) {
            openCommand.balance += balance

            if (openCommand.balance <= 0) {
                openCommand = null
            }
        }
    }

    return result.join('\n')
}

// brace 균형 검사 단계
// 한 줄에서 닫는 brace가 여는 brace보다 많은 경우 해당 줄을 주석 처리한다.
// 여는 brace가 더 많은 경우는 멀티라인 명령어일 수 있으므로 이 단계에서는 바로 처리하지 않는다.
function commentUnbalancedBraceLines(text, logs) {
    const lines = text.split('\n')

    const result = lines.map((line, index) => {
        const trimmed = line.trim()

        if (trimmed.startsWith('%')) {
            return line
        }

        const open = countUnescapedChar(line, '{')
        const close = countUnescapedChar(line, '}')

        if (close > open) {
            logs.push({
                line: index + 1,
                type: 'brace-balance',
                message: 'Line has more closing braces than opening braces.'
            })

            return `% [SANITIZED: unbalanced brace] ${line}`
        }

        return line
    })

    return result.join('\n')
}

// begin/end 환경 정리 단계
// 환경 stack을 사용해 \begin{...}와 \end{...}의 대응 관계를 검사한다.
// 누락된 \end{...}는 추가하고, 대응되는 \begin{...} 없는 \end{...}는 주석 처리한다.
function fixBeginEnd(text, logs) {
    const lines = text.split('\n')
    const result = [...lines]

    const stack = []

    for (let i = 0; i < result.length; i++) {
        const line = result[i]

        if (line.trim().startsWith('%')) {
            continue
        }

        const tokens = []

        for (const match of line.matchAll(/\\begin\{([^}]+)\}/g)) {
            tokens.push({
                type: 'begin',
                env: match[1],
                index: match.index
            })
        }

        for (const match of line.matchAll(/\\end\{([^}]+)\}/g)) {
            tokens.push({
                type: 'end',
                env: match[1],
                index: match.index
            })
        }

        tokens.sort((a, b) => a.index - b.index)

        for (const token of tokens) {
            if (token.type === 'begin') {
                stack.push({
                    env: token.env,
                    line: i
                })
                continue
            }

            const env = token.env

            if (stack.length > 0 && stack[stack.length - 1].env === env) {
                stack.pop()
                continue
            }

            const foundIndex = stack.findLastIndex(item => item.env === env)

            if (foundIndex !== -1) {
                while (stack.length - 1 > foundIndex) {
                    const missing = stack.pop()

                    result.splice(i, 0,
                        `% [SANITIZED: added missing end before line ${i + 1} for line ${missing.line + 1}]`,
                        `\\end{${missing.env}}`
                    )

                    logs.push({
                        line: missing.line + 1,
                        type: 'begin-end',
                        message: `Missing \\end{${missing.env}} was added before \\end{${env}}.`
                    })

                    i += 2
                }

                stack.pop()
            } else {
                result[i] = `% [SANITIZED: unmatched end] ${result[i]}`

                logs.push({
                    line: i + 1,
                    type: 'begin-end',
                    message: `Unmatched \\end{${env}} was commented out.`
                })
            }
        }
    }

    while (stack.length > 0) {
        const item = stack.pop()

        result.push(`% [SANITIZED: added missing end for line ${item.line + 1}]`)
        result.push(`\\end{${item.env}}`)

        logs.push({
            line: item.line + 1,
            type: 'begin-end',
            message: `Missing \\end{${item.env}} was added.`
        })
    }

    return result.join('\n')
}

// 한 줄에서 escape되지 않은 특정 문자의 개수를 센다.
function countUnescapedChar(line, target) {
    let count = 0

    for (let i = 0; i < line.length; i++) {
        if (line[i] === target && line[i - 1] !== '\\') {
            count++
        }
    }

    return count
}

// logs 배열을 사람이 읽기 쉬운 sanitize log 문자열로 변환한다.
function formatSanitizeLog(logs) {
    if (logs.length === 0) {
        return '[SANITIZE LOG]\nNo sanitize actions were applied.\n'
    }

    const lines = ['[SANITIZE LOG]']

    for (const log of logs) {
        lines.push(
            `line ${log.line} | ${log.type} | ${log.message}`
        )
    }

    return lines.join('\n') + '\n'
}

// CLI 실행부
// node sanitize.js <input.tex> <output.tex> <sanitize.log> 형식으로 실행할 수 있다.
if (require.main === module) {
    const [inputPath, outputPath, logPath] = process.argv.slice(2)

    if (!inputPath || !outputPath || !logPath) {
        console.error('Usage: node sanitize.js <input.tex> <output.tex> <sanitize.log>')
        process.exit(1)
    }

    const outputDir = path.dirname(outputPath)
    const logDir = path.dirname(logPath)

    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(logDir, { recursive: true })

    const result = sanitizeTexFile(inputPath, outputPath, logPath)

    console.log(JSON.stringify({
        success: true,
        sanitizedPath: result.sanitizedPath,
        logPath: result.logPath,
        actionCount: result.logs.length
    }, null, 2))
}

module.exports = {
    sanitizeTexFile,
    escapeSpecialChars,
    removeBrokenCommands,
    commentUnbalancedBraceLines,
    fixBeginEnd,
    formatSanitizeLog
}
*/