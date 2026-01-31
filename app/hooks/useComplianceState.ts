"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { clearChatMemory } from "@/lib/chatStore";
import type {
  UploadedFile,
  ContextFormData,
  ComplianceReport,
  AnalyzeRequest,
  UploadResponse,
  AnalysisImage,
} from "@/lib/schema";
import type {
  ReportThread,
  ReportEntry,
  AnalysisJobState,
  AnalysisStatusPayload,
} from "@/lib/mockData";
import {
  REPORT_THREADS_KEY,
  REPORT_HISTORY_KEY,
  ACTIVE_REPORT_THREAD_KEY,
  UPLOAD_CONCURRENCY,
  MOCK_PRODUCTS,
  MOCK_KNOWLEDGE_DOCS,
  loadFromStorage,
  deriveReportTitle,
} from "@/lib/mockData";

export function useComplianceState(sessionId: string) {
  // Report thread state
  const [reportThreads, setReportThreads] = useState<ReportThread[]>([]);
  const [activeReportThreadId, setActiveReportThreadId] = useState<string>("");
  const [reportHistory, setReportHistory] = useState<ReportEntry[]>([]);
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, AnalysisJobState>>({});

  // File upload state
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [vectorStoreId, setVectorStoreId] = useState<string | undefined>();
  const [context, setContext] = useState<ContextFormData>({
    productName: "",
    productCategory: "",
    abv: "",
    containerSize: "",
    producer: "",
    additionalNotes: "",
  });

  // Focus state
  const [focusFindingId, setFocusFindingId] = useState<string | undefined>();

  // Filter state for products
  const [productStatusFilter, setProductStatusFilter] = useState<string>("all");
  const [productSearchQuery, setProductSearchQuery] = useState<string>("");

  // Filter state for knowledgebase
  const [docCategoryFilter, setDocCategoryFilter] = useState<string>("all");
  const [docSearchQuery, setDocSearchQuery] = useState<string>("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisPollersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const hasSyncedAnalysesRef = useRef(false);

  // Load report threads from localStorage on mount
  useEffect(() => {
    const storedReportThreads = loadFromStorage<ReportThread[]>(REPORT_THREADS_KEY, []);
    const storedReports = loadFromStorage<ReportEntry[]>(REPORT_HISTORY_KEY, []);

    const normalizedReportThreads: ReportThread[] = storedReportThreads.map((thread) => ({
      id: thread.id,
      title: thread.title || "Analyzing label...",
      createdAt: thread.createdAt || new Date().toISOString(),
      updatedAt: thread.updatedAt || thread.createdAt || new Date().toISOString(),
      reportId: thread.reportId ?? null,
    }));

    const storedActiveReportThreadId = localStorage.getItem(ACTIVE_REPORT_THREAD_KEY);

    const sortedReports = [...normalizedReportThreads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    const nextActiveReportThreadId =
      storedActiveReportThreadId &&
      normalizedReportThreads.some((thread) => thread.id === storedActiveReportThreadId)
        ? storedActiveReportThreadId
        : sortedReports[0]?.id ?? "";

    setReportThreads(normalizedReportThreads);
    setReportHistory(storedReports);
    setActiveReportThreadId(nextActiveReportThreadId);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(REPORT_THREADS_KEY, JSON.stringify(reportThreads));
  }, [reportThreads]);

  useEffect(() => {
    localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(reportHistory));
  }, [reportHistory]);

  useEffect(() => {
    if (activeReportThreadId) {
      localStorage.setItem(ACTIVE_REPORT_THREAD_KEY, activeReportThreadId);
    }
  }, [activeReportThreadId]);

  useEffect(() => {
    setFocusFindingId(undefined);
  }, [activeReportThreadId]);

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

  // Cleanup pollers on unmount
  useEffect(() => {
    return () => {
      Object.values(analysisPollersRef.current).forEach((poller) => clearInterval(poller));
      analysisPollersRef.current = {};
    };
  }, []);

  // Computed values
  const hasReadyFiles = files.some((f) => f.status === "ready");
  const hasUploadingFiles = files.some((f) => f.status === "uploading" || f.status === "processing");
  const hasImages = files.some((f) => f.isImage && f.status === "ready");
  const isAnalyzing = useMemo(
    () => Object.values(analysisJobs).some((job) => job.status === "running"),
    [analysisJobs]
  );

  const activeReportThread = useMemo(
    () => reportThreads.find((thread) => thread.id === activeReportThreadId) || null,
    [reportThreads, activeReportThreadId]
  );
  const activeReportEntry = useMemo(
    () =>
      activeReportThread?.reportId
        ? reportHistory.find((entry) => entry.id === activeReportThread.reportId) || null
        : null,
    [reportHistory, activeReportThread]
  );

  const activeReport = activeReportEntry?.report ?? null;
  const reportLoading = activeReportThread
    ? analysisJobs[activeReportThread.id]?.status === "running"
    : false;
  const reportError =
    activeReportThread && analysisJobs[activeReportThread.id]?.status === "error"
      ? analysisJobs[activeReportThread.id]?.error ?? null
      : null;
  const reportVectorStoreId =
    activeReportEntry?.vectorStoreId ??
    (activeReportThread ? analysisJobs[activeReportThread.id]?.vectorStoreId : undefined) ??
    "";
  const reportChatTitle =
    activeReport?.inputs.context_summary?.trim() ||
    activeReportThread?.title ||
    "AI Compliance Assistant";

  const sortedReportThreads = useMemo(
    () =>
      [...reportThreads].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [reportThreads]
  );

  // Filtered products
  const filteredProducts = useMemo(() => {
    return MOCK_PRODUCTS.filter((product) => {
      const matchesStatus = productStatusFilter === "all" || product.status === productStatusFilter;
      const matchesSearch =
        !productSearchQuery ||
        product.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        product.category.toLowerCase().includes(productSearchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [productStatusFilter, productSearchQuery]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return MOCK_KNOWLEDGE_DOCS.filter((doc) => {
      const matchesCategory = docCategoryFilter === "all" || doc.category === docCategoryFilter;
      const matchesSearch =
        !docSearchQuery ||
        doc.name.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
        doc.description.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
        doc.fileName.toLowerCase().includes(docSearchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [docCategoryFilter, docSearchQuery]);

  const knowledgebaseStats = useMemo(() => {
    const timestamps = MOCK_KNOWLEDGE_DOCS
      .map((doc) => Date.parse(doc.lastUpdated))
      .filter((value) => !Number.isNaN(value));
    const latestTimestamp = timestamps.length ? Math.max(...timestamps) : undefined;
    return {
      total: MOCK_KNOWLEDGE_DOCS.length,
      latest: latestTimestamp ? new Date(latestTimestamp).toISOString().slice(0, 10) : "—",
    };
  }, []);

  // KPI calculations
  const kpiData = useMemo(() => {
    const total = MOCK_PRODUCTS.length;
    const inReview = MOCK_PRODUCTS.filter((p) => p.status === "in_review").length;
    const blocked = MOCK_PRODUCTS.filter((p) => p.status === "blocked").length;
    const avgDays = Math.round(
      MOCK_PRODUCTS.filter((p) => p.status !== "approved").reduce((sum, p) => sum + p.daysInStage, 0) /
        Math.max(1, MOCK_PRODUCTS.filter((p) => p.status !== "approved").length)
    );
    return { total, inReview, blocked, avgDays };
  }, []);

  // File upload handlers
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

  // Report chat handler
  const handleReportChatActivity = useCallback((threadId: string, content: string) => {
    void content;
    const now = new Date().toISOString();
    setReportThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId ? { ...thread, updatedAt: now } : thread
      )
    );
  }, []);

  const handleSelectReportThread = useCallback((threadId: string) => {
    setActiveReportThreadId(threadId);
    setFocusFindingId(undefined);
    setFiles([]);
    setVectorStoreId(undefined);
  }, []);

  // Start a new compliance analysis
  const handleStartUpload = useCallback(() => {
    setActiveReportThreadId("");
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
    setFocusFindingId(undefined);
  }, []);

  const stopAnalysisPolling = useCallback((threadId: string) => {
    const poller = analysisPollersRef.current[threadId];
    if (poller) {
      clearInterval(poller);
      delete analysisPollersRef.current[threadId];
    }
  }, []);

  const handleDeleteReportThread = useCallback(
    (threadId: string) => {
      const thread = reportThreads.find((t) => t.id === threadId);
      const reportId = thread?.reportId;

      setReportThreads((prev) => {
        const remaining = prev.filter((t) => t.id !== threadId);
        if (threadId === activeReportThreadId) {
          const nextActive = remaining[0]?.id ?? "";
          setActiveReportThreadId(nextActive);
        }
        return remaining;
      });

      if (reportId) {
        setReportHistory((prev) => prev.filter((entry) => entry.id !== reportId));
      }

      setAnalysisJobs((prev) => {
        if (!prev[threadId]) return prev;
        const next = { ...prev };
        delete next[threadId];
        return next;
      });

      stopAnalysisPolling(threadId);
      clearChatMemory(threadId);
    },
    [activeReportThreadId, reportThreads, stopAnalysisPolling]
  );

  const ensureReportThread = useCallback((threadId: string, title?: string) => {
    setReportThreads((prev) => {
      if (prev.some((thread) => thread.id === threadId)) return prev;
      const now = new Date().toISOString();
      const newThread: ReportThread = {
        id: threadId,
        title: title || "Analyzing label...",
        createdAt: now,
        updatedAt: now,
        reportId: null,
      };
      return [newThread, ...prev];
    });
  }, []);

  const applyAnalysisReport = useCallback(
    (threadId: string, result: ComplianceReport, storeId?: string) => {
      const reportTitle = deriveReportTitle(result);
      const completedAt = new Date().toISOString();

      setReportHistory((prev) => {
        const nextEntry: ReportEntry = {
          id: result.run_id,
          title: reportTitle,
          createdAt: result.created_at,
          report: result,
          vectorStoreId: storeId || undefined,
        };
        const existingIndex = prev.findIndex((entry) => entry.id === nextEntry.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = nextEntry;
          return next;
        }
        return [nextEntry, ...prev];
      });

      setReportThreads((prev) =>
        prev.map((thread) =>
          thread.id === threadId
            ? { ...thread, reportId: result.run_id, title: reportTitle, updatedAt: completedAt }
            : thread
        )
      );
    },
    []
  );

  const handleAnalysisStatus = useCallback(
    (threadId: string, payload: AnalysisStatusPayload) => {
      if (!payload?.status) return;

      if (payload.status === "running") {
        ensureReportThread(threadId);
        setAnalysisJobs((prev) => ({
          ...prev,
          [threadId]: {
            status: "running",
            reportId: payload.reportId,
            vectorStoreId: payload.vectorStoreId,
          },
        }));
        return;
      }

      if (payload.status === "done" && payload.report) {
        applyAnalysisReport(threadId, payload.report, payload.vectorStoreId);
        setAnalysisJobs((prev) => {
          if (!prev[threadId]) return prev;
          const next = { ...prev };
          delete next[threadId];
          return next;
        });
        stopAnalysisPolling(threadId);
        return;
      }

      if (payload.status === "error") {
        setAnalysisJobs((prev) => ({
          ...prev,
          [threadId]: {
            status: "error",
            error: payload.error || "Analysis failed",
          },
        }));
        stopAnalysisPolling(threadId);
      }
    },
    [applyAnalysisReport, ensureReportThread, stopAnalysisPolling]
  );

  const startAnalysisPolling = useCallback(
    (threadId: string) => {
      if (analysisPollersRef.current[threadId]) return;

      const poll = async () => {
        try {
          const query = new URLSearchParams({ threadId });
          if (sessionId) {
            query.set("sessionId", sessionId);
          }
          const response = await fetch(`/api/analyze?${query.toString()}`);
          if (response.status === 404) {
            handleAnalysisStatus(threadId, { status: "error", error: "Analysis not found. Please retry." });
            return;
          }
          if (!response.ok) {
            return;
          }
          const data = await response.json();
          handleAnalysisStatus(threadId, data);
        } catch {
          // Ignore transient errors
        }
      };

      void poll();
      analysisPollersRef.current[threadId] = setInterval(poll, 2000);
    },
    [handleAnalysisStatus, sessionId]
  );

  const syncPendingAnalyses = useCallback(async () => {
    const pendingThreads = reportThreads.filter((thread) => !thread.reportId);
    if (pendingThreads.length === 0) return;

    setAnalysisJobs((prev) => {
      const next = { ...prev };
      for (const thread of pendingThreads) {
        if (!next[thread.id]) {
          next[thread.id] = { status: "running" };
        }
      }
      return next;
    });

    const activeQuery = new URLSearchParams({ status: "active" });
    if (sessionId) {
      activeQuery.set("sessionId", sessionId);
    }
    const activeJobs = await fetch(`/api/analyze?${activeQuery.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => (Array.isArray(data?.jobs) ? data.jobs : []))
      .catch(() => []);

    const activeIds = new Set<string>();
    for (const job of activeJobs) {
      if (!job?.threadId) continue;
      activeIds.add(job.threadId);
      handleAnalysisStatus(job.threadId, job);
      startAnalysisPolling(job.threadId);
    }

    await Promise.all(
      pendingThreads
        .filter((thread) => !activeIds.has(thread.id))
        .map(async (thread) => {
          try {
            const query = new URLSearchParams({ threadId: thread.id });
            if (sessionId) {
              query.set("sessionId", sessionId);
            }
            const response = await fetch(`/api/analyze?${query.toString()}`);
            if (response.status === 404) {
              handleAnalysisStatus(thread.id, {
                status: "error",
                error: "Analysis not found. Please retry.",
              });
              return;
            }
            if (!response.ok) return;
            const data = await response.json();
            handleAnalysisStatus(thread.id, data);
            if (data?.status === "running") {
              startAnalysisPolling(thread.id);
            }
          } catch {
            // Ignore sync failures
          }
        })
    );
  }, [reportThreads, handleAnalysisStatus, startAnalysisPolling, sessionId]);

  const handleAnalyze = useCallback(async () => {
    if (!hasReadyFiles || isAnalyzing || !vectorStoreId || !hasImages) {
      return;
    }

    const now = new Date().toISOString();
    const readyFiles = files.filter((f) => f.status === "ready");

    const firstImageFile = readyFiles.find((f) => f.isImage);
    const pendingTitle = firstImageFile?.name || "Analyzing label...";

    const newThreadId = uuidv4();
    const newThread: ReportThread = {
      id: newThreadId,
      title: pendingTitle,
      createdAt: now,
      updatedAt: now,
      reportId: null,
    };
    setReportThreads((prev) => [newThread, ...prev]);

    setActiveReportThreadId(newThreadId);
    setAnalysisJobs((prev) => ({
      ...prev,
      [newThreadId]: { status: "running", vectorStoreId },
    }));
    try {
      const images: AnalysisImage[] = readyFiles
        .filter((f) => f.isImage && f.imageBase64)
        .map((f) => ({
          base64: f.imageBase64!,
          mimeType: f.mimeType,
          filename: f.name,
        }));

      const request: AnalyzeRequest = {
        sessionId,
        threadId: newThreadId,
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

      handleAnalysisStatus(newThreadId, result);
      if (result.status === "running") {
        startAnalysisPolling(newThreadId);
      }
    } catch (error) {
      setAnalysisJobs((prev) => ({
        ...prev,
        [newThreadId]: {
          status: "error",
          error: error instanceof Error ? error.message : "Analysis failed",
        },
      }));
    }

    return newThreadId;
  }, [hasReadyFiles, isAnalyzing, vectorStoreId, hasImages, files, sessionId, context, handleAnalysisStatus, startAnalysisPolling]);

  // Sync pending analyses on session load
  useEffect(() => {
    if (!sessionId || hasSyncedAnalysesRef.current || reportThreads.length === 0) return;
    hasSyncedAnalysesRef.current = true;
    void syncPendingAnalyses();
  }, [sessionId, reportThreads.length, syncPendingAnalyses]);

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

  const handleOpenDocUrl = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return {
    // Report threads
    reportThreads,
    activeReportThreadId,
    setActiveReportThreadId,
    reportHistory,
    analysisJobs,
    sortedReportThreads,
    activeReportThread,
    activeReportEntry,
    activeReport,
    reportLoading,
    reportError,
    reportVectorStoreId,
    reportChatTitle,
    // Files
    files,
    setFiles,
    context,
    setContext,
    vectorStoreId,
    setVectorStoreId,
    fileInputRef,
    hasReadyFiles,
    hasUploadingFiles,
    hasImages,
    isAnalyzing,
    // Focus
    focusFindingId,
    setFocusFindingId,
    // Filters
    productStatusFilter,
    setProductStatusFilter,
    productSearchQuery,
    setProductSearchQuery,
    docCategoryFilter,
    setDocCategoryFilter,
    docSearchQuery,
    setDocSearchQuery,
    // Computed
    filteredProducts,
    filteredDocs,
    knowledgebaseStats,
    kpiData,
    // Handlers
    handleFileSelect,
    removeFile,
    handleReportChatActivity,
    handleSelectReportThread,
    handleStartUpload,
    handleDeleteReportThread,
    handleAnalyze,
    handleAskAboutFinding,
    handleJumpToFinding,
    handleClearFocus,
    handleOpenDocUrl,
  };
}
