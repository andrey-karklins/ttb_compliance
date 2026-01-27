"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { ResultsPanel } from "./components/ResultsPanel";
import { ChatPanel } from "./components/ChatPanel";
import { clearChatMemory } from "../lib/chatStore";
import type {
  UploadedFile,
  ContextFormData,
  ComplianceReport,
  AnalyzeRequest,
  UploadResponse,
  AnalysisImage,
  ChatImage,
} from "@/lib/schema";

const SESSION_KEY = "ttb_session_id";
const CHAT_THREADS_KEY = "ttb_chat_threads_v1";
const REPORT_HISTORY_KEY = "ttb_report_history_v1";
const ACTIVE_CHAT_KEY = "ttb_active_chat_id_v1";
const UPLOAD_CONCURRENCY = 3;
const DEFAULT_CHAT_TITLE = "New chat";
const DEFAULT_REPORT_TITLE = "New report";

type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  reportId: string | null;
  kind: "chat" | "report";
  autoTitle: boolean;
};

type ReportEntry = {
  id: string;
  title: string;
  createdAt: string;
  report: ComplianceReport;
  vectorStoreId?: string;
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function deriveChatTitle(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return DEFAULT_CHAT_TITLE;
  return firstLine.length > 52 ? `${firstLine.slice(0, 52)}…` : firstLine;
}

function deriveReportTitle(report: ComplianceReport): string {
  const labelName = report.inputs.label_files?.[0];
  if (labelName) return labelName;
  return `Report ${report.run_id.slice(0, 8)}`;
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>("");
  const [vectorStoreId, setVectorStoreId] = useState<string | undefined>();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [context, setContext] = useState<ContextFormData>({
    productName: "",
    productCategory: "",
    abv: "",
    containerSize: "",
    producer: "",
    additionalNotes: "",
  });
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [focusFindingId, setFocusFindingId] = useState<string | undefined>();
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportEntry[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [draftChatId, setDraftChatId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(SESSION_KEY, id);
    }
    setSessionId(id);
  }, []);

  const createChatThread = useCallback(
    (reportId: string | null = null, kind: "chat" | "report" = "chat"): ChatThread => {
      const now = new Date().toISOString();
      const resolvedKind = reportId ? "report" : kind;
      return {
        id: uuidv4(),
        title: resolvedKind === "report" ? DEFAULT_REPORT_TITLE : DEFAULT_CHAT_TITLE,
        createdAt: now,
        updatedAt: now,
        reportId,
        kind: resolvedKind,
        autoTitle: true,
      };
    },
    []
  );

  useEffect(() => {
    const storedChatsRaw = loadFromStorage<ChatThread[]>(CHAT_THREADS_KEY, []);
    const storedReports = loadFromStorage<ReportEntry[]>(REPORT_HISTORY_KEY, []);
    const storedChats = storedChatsRaw.map((thread) => ({
      ...thread,
      kind: thread.kind ?? (thread.reportId ? "report" : "chat"),
    }));
    const nextChats = storedChats.length > 0 ? storedChats : [createChatThread(null, "chat")];

    const storedActiveChatId = localStorage.getItem(ACTIVE_CHAT_KEY);
    const nextActiveChatId =
      storedActiveChatId && nextChats.some((thread) => thread.id === storedActiveChatId)
        ? storedActiveChatId
        : nextChats[0].id;

    const selectedChat = nextChats.find((thread) => thread.id === nextActiveChatId);
    const nextActiveReportId = selectedChat?.reportId ?? null;
    const nextDraftChatId =
      selectedChat && selectedChat.kind === "report" && !selectedChat.reportId
        ? selectedChat.id
        : null;

    setChatThreads(nextChats);
    setReportHistory(storedReports);
    setActiveChatId(nextActiveChatId);
    setActiveReportId(nextActiveReportId);
    setDraftChatId(nextDraftChatId);
  }, [createChatThread]);

  useEffect(() => {
    localStorage.setItem(CHAT_THREADS_KEY, JSON.stringify(chatThreads));
  }, [chatThreads]);

  useEffect(() => {
    localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(reportHistory));
  }, [reportHistory]);

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    }
  }, [activeChatId]);

  useEffect(() => {
    if (!activeReportId) {
      setReport(null);
      setFocusFindingId(undefined);
      return;
    }
    const entry = reportHistory.find((item) => item.id === activeReportId);
    setReport(entry?.report ?? null);
    setAnalysisError(null);
    setFocusFindingId(undefined);
    setIsAnalyzing(false);
  }, [activeReportId, reportHistory]);

  const hasReadyFiles = files.some((f) => f.status === "ready");
  const hasUploadingFiles = files.some((f) => f.status === "uploading" || f.status === "processing");
  const hasImages = files.some((f) => f.isImage && f.status === "ready");
  const isDraftActive = Boolean(draftChatId && activeChatId === draftChatId);
  const showUploadPanel = isDraftActive && !isAnalyzing && !report && !analysisError;
  const reportLoading = isDraftActive ? isAnalyzing : false;
  const reportError = isDraftActive ? analysisError : null;
  const hasPendingEntity = useMemo(
    () =>
      chatThreads.some(
        (thread) =>
          (thread.kind === "chat" && thread.autoTitle) ||
          (thread.kind === "report" && !thread.reportId)
      ),
    [chatThreads]
  );
  const contentMaxWidthClass = report ? "max-w-[2120px]" : "max-w-[1204px]";

  const activeReportEntry = useMemo(
    () => reportHistory.find((entry) => entry.id === activeReportId) || null,
    [reportHistory, activeReportId]
  );

  const chatVectorStoreId = useMemo(() => {
    if (isDraftActive) {
      return vectorStoreId || "";
    }
    if (activeReportId) {
      return activeReportEntry?.vectorStoreId ?? "";
    }
    return "";
  }, [activeReportId, vectorStoreId, activeReportEntry, isDraftActive]);

  const sortedChatThreads = useMemo(
    () =>
      [...chatThreads].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [chatThreads]
  );

  // Compute chat images from ready image files
  const draftChatImages: ChatImage[] = useMemo(() => {
    return files
      .filter((f) => f.isImage && f.status === "ready" && f.imageBase64)
      .map((f) => ({
        base64: f.imageBase64!,
        mimeType: f.mimeType,
        filename: f.name,
      }));
  }, [files]);

  const activeChatImages = useMemo(() => {
    if (!isDraftActive) {
      return [];
    }
    return draftChatImages;
  }, [draftChatImages, isDraftActive]);

  // Auto-fill context from extracted details
  useEffect(() => {
    const imageFile = files.find((f) => f.isImage && f.extractedDetails);
    if (imageFile?.extractedDetails) {
      setContext((prev) => ({
        productName: prev.productName || imageFile.extractedDetails?.productName || "",
        productCategory: prev.productCategory || imageFile.extractedDetails?.productCategory || "",
        abv: prev.abv || imageFile.extractedDetails?.abv || "",
        containerSize: prev.containerSize || imageFile.extractedDetails?.containerSize || "",
        producer: prev.producer || imageFile.extractedDetails?.producer || "",
        additionalNotes: prev.additionalNotes,
      }));
    }
  }, [files]);

  const uploadSingleFile = useCallback(
    async (file: File, fileId: string, currentVectorStoreId: string | undefined) => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", sessionId);
        if (currentVectorStoreId) {
          formData.append("vectorStoreId", currentVectorStoreId);
        }

        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        const result: UploadResponse = await response.json();

        if (!response.ok) {
          throw new Error((result as unknown as { error: string }).error || "Upload failed");
        }

        return { success: true, result, fileId };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Upload failed",
          fileId,
        };
      }
    },
    [sessionId]
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []);
      if (selectedFiles.length === 0) return;

      const newFiles: UploadedFile[] = selectedFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        size: file.size,
        isImage: file.type.startsWith("image/"),
        status: "uploading" as const,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      let currentVectorStoreId = vectorStoreId;
      const fileQueue = selectedFiles.map((file, i) => ({ file, id: newFiles[i].id }));

      for (let i = 0; i < fileQueue.length; i += UPLOAD_CONCURRENCY) {
        const batch = fileQueue.slice(i, i + UPLOAD_CONCURRENCY);

        const results = await Promise.all(
          batch.map(({ file, id }) => uploadSingleFile(file, id, currentVectorStoreId))
        );

        for (const res of results) {
          if (res.success && res.result) {
            if (res.result.vectorStoreId && !currentVectorStoreId) {
              currentVectorStoreId = res.result.vectorStoreId;
              setVectorStoreId(res.result.vectorStoreId);
            }

            setFiles((prev) =>
              prev.map((f) =>
                f.id === res.fileId
                  ? {
                      ...f,
                      status: "ready" as const,
                      extractedDetails: res.result!.extractedDetails,
                      imageBase64: res.result!.imageBase64,
                    }
                  : f
              )
            );
          } else {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === res.fileId
                  ? {
                      ...f,
                      status: "error" as const,
                      error: res.error || "Upload failed",
                    }
                  : f
              )
            );
          }
        }
      }
    },
    [vectorStoreId, uploadSingleFile]
  );

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleChatActivity = useCallback((chatId: string, content: string) => {
    const now = new Date().toISOString();
    setChatThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== chatId) return thread;
        if (thread.autoTitle) {
          return {
            ...thread,
            title: deriveChatTitle(content),
            autoTitle: false,
            updatedAt: now,
          };
        }
        return { ...thread, updatedAt: now };
      })
    );
  }, []);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setActiveChatId(chatId);
      const selected = chatThreads.find((thread) => thread.id === chatId);
      setActiveReportId(selected?.reportId ?? null);
      setFocusFindingId(undefined);
      if (selected && selected.kind === "report" && !selected.reportId) {
        setDraftChatId(selected.id);
      } else {
        setDraftChatId(null);
      }
    },
    [chatThreads]
  );

  const handleNewChat = useCallback(
    () => {
      const newChat = createChatThread(null, "chat");
      setChatThreads((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      setActiveReportId(null);
      setFocusFindingId(undefined);
      setDraftChatId(null);
    },
    [createChatThread]
  );

  const handleNewReport = useCallback(() => {
    setReport(null);
    setVectorStoreId(undefined);
    setFiles([]);
    setContext({
      productName: "",
      productCategory: "",
      abv: "",
      containerSize: "",
      producer: "",
      additionalNotes: "",
    });
    setAnalysisError(null);
    setFocusFindingId(undefined);
    setIsAnalyzing(false);
    setActiveReportId(null);
    const newChat = createChatThread(null, "report");
    setChatThreads((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setDraftChatId(newChat.id);
  }, [createChatThread]);

  const handleDeleteChat = useCallback(
    (chatId: string) => {
      const reportId = chatThreads.find((thread) => thread.id === chatId)?.reportId;
      setChatThreads((prev) => {
        const remaining = prev.filter((thread) => thread.id !== chatId);
        if (remaining.length === 0) {
          const newChat = createChatThread(null, "chat");
          setActiveChatId(newChat.id);
          setActiveReportId(null);
          setDraftChatId(null);
          return [newChat];
        }
        if (chatId === activeChatId) {
          const nextActive = remaining[0];
          setActiveChatId(nextActive.id);
          setActiveReportId(nextActive.reportId ?? null);
          if (nextActive.kind === "report" && !nextActive.reportId) {
            setDraftChatId(nextActive.id);
          } else {
            setDraftChatId(null);
          }
        }
        if (draftChatId === chatId) {
          setDraftChatId(null);
        }
        return remaining;
      });
      if (reportId) {
        setReportHistory((prev) => prev.filter((entry) => entry.id !== reportId));
      }
      clearChatMemory(chatId);
    },
    [activeChatId, chatThreads, createChatThread, draftChatId]
  );

  const handleAnalyze = async () => {
    if (!isDraftActive || !hasReadyFiles || isAnalyzing || !vectorStoreId || !hasImages) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const readyFiles = files.filter((f) => f.status === "ready");
      const images: AnalysisImage[] = readyFiles
        .filter((f) => f.isImage && f.imageBase64)
        .map((f) => ({
          base64: f.imageBase64!,
          mimeType: f.mimeType,
          filename: f.name,
        }));

      const request: AnalyzeRequest = {
        sessionId,
        vectorStoreId,
        context,
        images,
        readyFileNames: readyFiles.map((f) => f.name),
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Analysis failed");
      }

      setReport(result);
      const reportTitle = deriveReportTitle(result);
      const newEntry: ReportEntry = {
        id: result.run_id,
        title: reportTitle,
        createdAt: result.created_at,
        report: result,
        vectorStoreId: vectorStoreId || undefined,
      };
      setReportHistory((prev) => {
        const existingIndex = prev.findIndex((entry) => entry.id === newEntry.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = newEntry;
          return next;
        }
        return [newEntry, ...prev];
      });
      const now = new Date().toISOString();
      setChatThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== activeChatId) return thread;
          const shouldUpdateTitle =
            thread.autoTitle ||
            thread.title === DEFAULT_CHAT_TITLE ||
            thread.title === DEFAULT_REPORT_TITLE;
          return {
            ...thread,
            reportId: result.run_id,
            kind: "report",
            updatedAt: now,
            title: shouldUpdateTitle ? reportTitle : thread.title,
            autoTitle: shouldUpdateTitle ? false : thread.autoTitle,
          };
        })
      );
      setActiveReportId(result.run_id);
      setDraftChatId(null);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAskAboutFinding = useCallback((findingId: string) => {
    setFocusFindingId(findingId);
  }, []);

  const handleJumpToFinding = useCallback((findingId: string) => {
    const element = document.getElementById(`finding-${findingId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const handleClearFocus = useCallback(() => {
    setFocusFindingId(undefined);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!sessionId || !activeChatId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b border-gray-200 sticky top-0 z-10">
        <div className={`w-full ${contentMaxWidthClass} mx-auto px-4 py-4`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">TTB Compliance Checker</h1>
              <p className="text-xs text-gray-500">Alcohol Beverage Label Analysis</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`mx-auto w-full ${contentMaxWidthClass} px-4 py-6`}>
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left sidebar: Conversations */}
          <aside className="lg:w-72 lg:shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 lg:sticky lg:top-24">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={handleNewChat}
                  disabled={hasPendingEntity}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    hasPendingEntity
                      ? "border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50"
                      : "border-violet-200 text-violet-700 hover:bg-violet-50"
                  }`}
                >
                  New chat
                </button>
                <button
                  onClick={handleNewReport}
                  disabled={hasPendingEntity}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    hasPendingEntity
                      ? "border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50"
                      : "border-blue-200 text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  New report
                </button>
              </div>

              <div className="mt-4">
                {sortedChatThreads.length === 0 ? (
                  <p className="text-xs text-gray-500">No conversations yet.</p>
                ) : (
                  <div className="space-y-1">
                    {sortedChatThreads.map((thread) => {
                      const isActive = thread.id === activeChatId;
                      const statusLabel = thread.reportId
                        ? "Report attached"
                        : thread.kind === "report"
                          ? "Report draft"
                          : "Chat";
                      const statusDot = thread.reportId
                        ? "bg-blue-500"
                        : thread.kind === "report"
                          ? "bg-blue-300"
                          : "bg-violet-400";
                      return (
                        <button
                          key={thread.id}
                          onClick={() => handleSelectChat(thread.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                            isActive
                              ? "border-violet-300 bg-violet-50"
                              : "border-transparent hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {thread.title || DEFAULT_CHAT_TITLE}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteChat(thread.id);
                              }}
                              className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-white transition-colors"
                              aria-label="Delete conversation"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                            <span className="truncate">{statusLabel}</span>
                            {thread.updatedAt && (
                              <span className="text-gray-400">
                                · {formatShortDate(thread.updatedAt)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>

          <div className="flex flex-col lg:flex-row gap-4 lg:flex-1 lg:min-w-0">
            {isDraftActive ? (
              <section className="w-full max-w-[900px] mx-auto lg:flex-1 lg:min-w-0 lg:max-w-[900px] space-y-4">
                {showUploadPanel ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">
                      Upload Label Assets
                    </h2>
                    <p className="text-sm text-gray-600 mb-6">
                      Drop label images (PNG, JPG, WebP) and optional supporting PDFs. Include front/back labels for best results.
                    </p>

                    {/* Upload area */}
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-600 mb-1">Click to upload or drag and drop</p>
                      <p className="text-sm text-gray-500">PNG, JPG, WEBP, PDF up to 20MB each</p>
                    </div>

                    {/* File list */}
                    {files.length > 0 && (
                      <div className="mt-6 space-y-3">
                        <h3 className="text-sm font-medium text-gray-700">Files ({files.length})</h3>
                        <ul className="space-y-2">
                          {files.map((file) => (
                            <li key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${file.isImage ? "bg-blue-100" : "bg-blue-100/70"}`}>
                                  {file.isImage ? (
                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}{file.isImage && " • Label"}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {file.status === "uploading" && (
                                  <div className="flex items-center gap-2 text-blue-600">
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span className="text-xs">Uploading...</span>
                                  </div>
                                )}
                                {file.status === "ready" && <span className="text-xs text-blue-600 font-medium">Ready</span>}
                                {file.status === "error" && <span className="text-xs text-red-600">{file.error}</span>}
                                <button onClick={() => removeFile(file.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Optional notes */}
                    {files.length > 0 && (
                      <div className="mt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Additional Notes (Optional)
                        </label>
                        <textarea
                          value={context.additionalNotes}
                          onChange={(e) => setContext({ ...context, additionalNotes: e.target.value })}
                          placeholder="Any specific concerns to check..."
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                      </div>
                    )}

                    {/* Analyze button */}
                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={handleAnalyze}
                        disabled={!hasReadyFiles || hasUploadingFiles || !hasImages || isAnalyzing}
                        className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                          !hasReadyFiles || hasUploadingFiles || !hasImages || isAnalyzing
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                        }`}
                      >
                        {isAnalyzing ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Analyzing...
                          </span>
                        ) : (
                          "Analyze Label"
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <ResultsPanel
                      report={report}
                      isLoading={reportLoading}
                      error={reportError}
                      onAskAboutFinding={handleAskAboutFinding}
                    />
                  </div>
                )}
              </section>
            ) : (
              <>
                <section className="w-full lg:flex-1 lg:min-w-0 lg:max-w-[900px]">
                  <div className="lg:sticky lg:top-24 bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-12rem)] lg:h-[calc(100vh-12rem)] flex flex-col overflow-hidden">
                    <ChatPanel
                      chatId={activeChatId}
                      sessionId={sessionId}
                      vectorStoreId={chatVectorStoreId}
                      report={report}
                      images={activeChatImages}
                      onJumpToFinding={handleJumpToFinding}
                      focusFindingId={focusFindingId}
                      onClearFocus={handleClearFocus}
                      onChatActivity={handleChatActivity}
                    />
                  </div>
                </section>
                {report && (
                  <section className="w-full lg:flex-1 lg:min-w-0 lg:max-w-[900px]">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                      <ResultsPanel
                        report={report}
                        isLoading={false}
                        error={null}
                        onAskAboutFinding={handleAskAboutFinding}
                      />
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`mx-auto w-full ${contentMaxWidthClass} px-4 py-6 text-center text-xs text-gray-400`} />
    </div>
  );
}
