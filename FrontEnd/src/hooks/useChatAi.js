/**
 * =================================================================
 * [Hook] AI Chat State & Workflow
 * 설명: 에디터 AI 채팅 입력, 응답, 로딩 상태 및 현재 파일 컨텍스트 전송을 관리함
 * =================================================================
 */
import { useCallback, useMemo, useState } from 'react';
import { ChatService } from '../services/ChatAiService';
import { EditorService } from '../services/EditorService';

const MAX_RECENT_MESSAGES = 10;
const MAX_SUMMARY_CHARS = 3200;
const MAX_CONTEXT_FILES = 6;
const MAX_FILE_CHARS = 18000;

const emptyChatState = {
    isOpen: false,
    input: '',
    chatLog: []
};

const normalizeId = (value) => String(value || '').replace(/^0x/i, '').replace(/-/g, '').toLowerCase().trim();

const getProjectId = (project) => project?.id || project?._id || project?.projectId || '';

const getEntryId = (entry) => normalizeId(entry?.id || entry?.fileId || entry?.entryId);

const getEntryName = (entry) => entry?.name || entry?.fileName || entry?.title || '';

const isTextLikeLatexFile = (fileName = '') => {
    const lower = String(fileName).toLowerCase();
    return lower.endsWith('.tex') || lower.endsWith('.bib') || lower.endsWith('.sty') || lower.endsWith('.cls');
};

const normalizePath = (value = '') => String(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .trim();

const dirname = (filePath = '') => {
    const normalized = normalizePath(filePath);
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(0, index) : '';
};

const stripTexExtension = (value = '') => String(value).replace(/\.tex$/i, '');

const flattenEntries = (nodes = [], parentPath = '') => {
    const result = [];

    for (const node of nodes || []) {
        const name = getEntryName(node);
        const currentPath = normalizePath(parentPath ? `${parentPath}/${name}` : name);
        const type = node?.type === 'folder' ? 'folder' : 'file';
        const record = {
            ...node,
            id: getEntryId(node),
            name,
            type,
            path: currentPath
        };

        result.push(record);

        if (node?.children?.length) {
            result.push(...flattenEntries(node.children, currentPath));
        }
    }

    return result;
};

const extractLatexReferences = (content = '') => {
    const refs = [];
    const pattern = /\\(?:input|include|subfile)\s*\{([^}]+)\}/g;
    let match;

    while ((match = pattern.exec(String(content))) !== null) {
        const rawRef = normalizePath(match[1]);
        if (!rawRef || rawRef.startsWith('/')) continue;
        refs.push(rawRef);
    }

    return Array.from(new Set(refs));
};

const buildCandidatePaths = (reference, activePath) => {
    const ref = normalizePath(reference);
    const activeDir = dirname(activePath);
    const withExt = ref.match(/\.[^/.]+$/) ? [ref] : [ref, `${ref}.tex`];
    const candidates = [];

    for (const item of withExt) {
        candidates.push(item);
        if (activeDir) candidates.push(`${activeDir}/${item}`);
    }

    return Array.from(new Set(candidates.map(normalizePath)));
};

const findReferencedEntry = (flatEntries, reference, activePath) => {
    const candidates = buildCandidatePaths(reference, activePath);

    return flatEntries.find((entry) => {
        if (entry.type === 'folder') return false;
        if (!isTextLikeLatexFile(entry.name)) return false;

        const path = normalizePath(entry.path);
        const pathWithoutTex = stripTexExtension(path);
        const nameWithoutTex = stripTexExtension(entry.name);

        return candidates.some((candidate) => {
            const normalized = normalizePath(candidate);
            return path === normalized || pathWithoutTex === stripTexExtension(normalized) || nameWithoutTex === stripTexExtension(normalized);
        });
    });
};

const clipText = (value = '', max = MAX_FILE_CHARS) => {
    const text = String(value || '');
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n\n% [AI context truncated: ${text.length - max} characters omitted]`;
};

const buildConversationMemory = (messages) => {
    const safeMessages = Array.isArray(messages) ? messages : [];
    if (safeMessages.length <= MAX_RECENT_MESSAGES) {
        return { recentMessages: safeMessages, memorySummary: '' };
    }

    const olderMessages = safeMessages.slice(0, -MAX_RECENT_MESSAGES);
    const recentMessages = safeMessages.slice(-MAX_RECENT_MESSAGES);
    const memorySummary = olderMessages
        .map((message) => {
            const role = message.role === 'assistant' ? 'AI' : 'User';
            const content = String(message.content || '').replace(/\s+/g, ' ').trim();
            return `${role}: ${content.slice(0, 500)}`;
        })
        .join('\n')
        .slice(-MAX_SUMMARY_CHARS);

    return { recentMessages, memorySummary };
};

export const useChat = ({
    project,
    files,
    activeFileId,
    activeFileMeta,
    currentLaTeX,
    getCurrentLaTeX,
    chatState,
    setChatState
}) => {
    const fallbackState = chatState || emptyChatState;
    const [isLoading, setIsLoading] = useState(false);

    const projectId = getProjectId(project);

    const flatEntries = useMemo(() => flattenEntries(files), [files]);

    const activeFile = useMemo(() => {
        const cleanActiveId = normalizeId(activeFileId || activeFileMeta?.id);
        return flatEntries.find((entry) => entry.id === cleanActiveId) || {
            id: cleanActiveId,
            name: activeFileMeta?.name || '현재 파일',
            path: activeFileMeta?.name || '현재 파일',
            type: 'file'
        };
    }, [activeFileId, activeFileMeta, flatEntries]);

    const updateChatState = useCallback((updater) => {
        setChatState((prev) => {
            const base = prev || emptyChatState;
            return typeof updater === 'function' ? updater(base) : updater;
        });
    }, [setChatState]);

    const setInput = useCallback((value) => {
        updateChatState((prev) => ({ ...prev, input: value }));
    }, [updateChatState]);

    const toggleChat = useCallback(() => {
        updateChatState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
    }, [updateChatState]);

    const buildLatexContext = useCallback(async () => {
        const currentContent = getCurrentLaTeX?.() ?? currentLaTeX ?? '';
        const currentFile = {
            id: activeFile.id,
            path: activeFile.path || activeFile.name || '현재 파일',
            name: activeFile.name || '현재 파일',
            content: clipText(currentContent)
        };

        const references = extractLatexReferences(currentContent);
        const relatedFiles = [];
        const usedIds = new Set([normalizeId(currentFile.id)]);

        for (const reference of references) {
            if (relatedFiles.length >= MAX_CONTEXT_FILES) break;

            const entry = findReferencedEntry(flatEntries, reference, currentFile.path);
            if (!entry || usedIds.has(entry.id) || !projectId) continue;

            usedIds.add(entry.id);

            try {
                const result = await EditorService.getFileContent(projectId, entry.id);
                if (result.success) {
                    relatedFiles.push({
                        id: entry.id,
                        path: entry.path,
                        name: entry.name,
                        importSource: reference,
                        content: clipText(result.data?.content || '')
                    });
                }
            } catch (error) {
                relatedFiles.push({
                    id: entry.id,
                    path: entry.path,
                    name: entry.name,
                    importSource: reference,
                    content: `% [AI context warning: ${entry.path} 파일을 불러오지 못했습니다.]`
                });
            }
        }

        return {
            project: {
                id: projectId,
                title: project?.title || project?.name || '무제 프로젝트'
            },
            activeFile: currentFile,
            relatedFiles,
            referencePolicy: '현재 활성 파일과 해당 파일에서 직접 input/include/subfile로 참조한 파일만 포함했습니다.'
        };
    }, [activeFile, currentLaTeX, flatEntries, getCurrentLaTeX, project, projectId]);

    const handleSend = useCallback(async (e) => {
        if (e?.preventDefault) e.preventDefault();

        const question = String(fallbackState.input || '').trim();
        if (!question || isLoading) return;

        const userMessage = { role: 'user', content: question };
        const nextLog = [...(fallbackState.chatLog || []), userMessage];

        updateChatState((prev) => ({ ...prev, input: '', chatLog: nextLog }));
        setIsLoading(true);

        try {
            const latexContext = await buildLatexContext();
            const { recentMessages, memorySummary } = buildConversationMemory(nextLog);
            const data = await ChatService.askAI({
                messages: recentMessages,
                memorySummary,
                latexContext
            });
            const assistantMessage = { role: 'assistant', content: data.reply };
            updateChatState((prev) => ({
                ...prev,
                chatLog: [...(prev.chatLog || []), assistantMessage]
            }));
        } catch (err) {
            updateChatState((prev) => ({
                ...prev,
                chatLog: [
                    ...(prev.chatLog || []),
                    { role: 'assistant', content: '죄송합니다. AI 응답 생성 중 오류가 발생했습니다.' }
                ]
            }));
        } finally {
            setIsLoading(false);
        }
    }, [buildLatexContext, fallbackState.chatLog, fallbackState.input, isLoading, updateChatState]);

    return {
        isOpen: Boolean(fallbackState.isOpen),
        toggleChat,
        input: fallbackState.input || '',
        setInput,
        chatLog: fallbackState.chatLog || [],
        handleSend,
        isLoading
    };
};
