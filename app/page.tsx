"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChatPanel } from "./components/ChatPanel";
import { ResultsPanel } from "./components/ResultsPanel";
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
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ============================================================================
// MOCKED DATA
// ============================================================================

type NavItem = "dashboard" | "products" | "copilot" | "knowledgebase";

type Product = {
  id: string;
  name: string;
  category: string;
  market: string;
  status: "approved" | "in_review" | "blocked" | "pending";
  stage: string;
  daysInStage: number;
  owner: string;
  ownerInitials: string;
  lastUpdated: string;
};

type Blocker = {
  id: string;
  productName: string;
  issue: string;
  severity: "critical" | "high" | "medium";
  owner: string;
  ownerInitials: string;
  daysOpen: number;
};

type Activity = {
  id: string;
  action: string;
  product: string;
  user: string;
  timestamp: string;
};

type KnowledgeDoc = {
  id: string;
  name: string;
  category: string;
  type: "pdf" | "md";
  lastUpdated: string;
  description: string;
};

const MOCK_PRODUCTS: Product[] = [
  { id: "PRD-001", name: "KHOR Platinum Vodka 1L", category: "Vodka", market: "USA", status: "approved", stage: "Complete", daysInStage: 0, owner: "Sarah Chen", ownerInitials: "SC", lastUpdated: "2026-01-15" },
  { id: "PRD-002", name: "KHOR ICE Vodka 750ml", category: "Vodka", market: "USA", status: "approved", stage: "Complete", daysInStage: 0, owner: "Sarah Chen", ownerInitials: "SC", lastUpdated: "2026-01-10" },
  { id: "PRD-003", name: "KHOR DE LUXE Vodka 750ml", category: "Vodka", market: "USA", status: "in_review", stage: "COLA/Labeling", daysInStage: 8, owner: "Mike Torres", ownerInitials: "MT", lastUpdated: "2026-01-24" },
  { id: "PRD-004", name: "KROL Potato Vodka 750ml", category: "Vodka", market: "USA", status: "in_review", stage: "Import/Customs", daysInStage: 5, owner: "James Wilson", ownerInitials: "JW", lastUpdated: "2026-01-27" },
  { id: "PRD-005", name: "Odessa VSOP Brandy 750ml", category: "Brandy", market: "USA", status: "approved", stage: "Complete", daysInStage: 0, owner: "Lisa Park", ownerInitials: "LP", lastUpdated: "2026-01-12" },
  { id: "PRD-006", name: "Por La Gente Tequila Blanco", category: "Tequila", market: "USA", status: "in_review", stage: "COLA/Labeling", daysInStage: 12, owner: "Sarah Chen", ownerInitials: "SC", lastUpdated: "2026-01-25" },
  { id: "PRD-007", name: "Por La Gente Tequila Reposado", category: "Tequila", market: "USA", status: "blocked", stage: "Formula Approval", daysInStage: 28, owner: "Mike Torres", ownerInitials: "MT", lastUpdated: "2026-01-20" },
  { id: "PRD-008", name: "Por La Gente Tequila Añejo", category: "Tequila", market: "USA", status: "pending", stage: "State Approvals", daysInStage: 3, owner: "Lisa Park", ownerInitials: "LP", lastUpdated: "2026-01-26" },
  { id: "PRD-009", name: "Cumberland Falls Bourbon", category: "Bourbon", market: "USA", status: "in_review", stage: "COLA/Labeling", daysInStage: 15, owner: "James Wilson", ownerInitials: "JW", lastUpdated: "2026-01-22" },
  { id: "PRD-010", name: "Ameris Gin Original Mediterranean Recipe", category: "Gin", market: "USA", status: "pending", stage: "Formula Approval", daysInStage: 2, owner: "Sarah Chen", ownerInitials: "SC", lastUpdated: "2026-01-27" },
  { id: "PRD-011", name: "Ameris Gin Italian Citrus Recipe", category: "Gin", market: "USA", status: "pending", stage: "Formula Approval", daysInStage: 2, owner: "Sarah Chen", ownerInitials: "SC", lastUpdated: "2026-01-27" },
];

const MOCK_BLOCKERS: Blocker[] = [
  { id: "BLK-001", productName: "Por La Gente Tequila Reposado", issue: "Missing agave source documentation", severity: "critical", owner: "Mike Torres", ownerInitials: "MT", daysOpen: 14 },
  { id: "BLK-002", productName: "Cumberland Falls Bourbon", issue: "Mashbill percentage verification pending", severity: "high", owner: "James Wilson", ownerInitials: "JW", daysOpen: 8 },
  { id: "BLK-003", productName: "KHOR DE LUXE Vodka 750ml", issue: "Country of origin labeling clarification", severity: "medium", owner: "Mike Torres", ownerInitials: "MT", daysOpen: 3 },
];

const MOCK_ACTIVITIES: Activity[] = [
  { id: "ACT-001", action: "Submitted for COLA review", product: "KROL Potato Vodka 750ml", user: "James Wilson", timestamp: "2026-01-28T09:30:00Z" },
  { id: "ACT-002", action: "Label revision uploaded", product: "Por La Gente Tequila Blanco", user: "Sarah Chen", timestamp: "2026-01-28T08:15:00Z" },
  { id: "ACT-003", action: "Formula submitted", product: "Ameris Gin Original Mediterranean Recipe", user: "Sarah Chen", timestamp: "2026-01-27T16:45:00Z" },
  { id: "ACT-004", action: "COLA approved", product: "KHOR Platinum Vodka 1L", user: "System", timestamp: "2026-01-27T14:20:00Z" },
  { id: "ACT-005", action: "State approval received (NY)", product: "Odessa VSOP Brandy 750ml", user: "System", timestamp: "2026-01-27T11:00:00Z" },
];

const MOCK_KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  { id: "DOC-001", name: "CFR Title 27 - Vol 1", category: "Regulations", type: "pdf", lastUpdated: "2025-01-01", description: "Code of Federal Regulations - Alcohol, Tobacco Products and Firearms" },
  { id: "DOC-002", name: "CFR Title 27 - Vol 2", category: "Regulations", type: "pdf", lastUpdated: "2025-01-01", description: "Code of Federal Regulations - Continued" },
  { id: "DOC-003", name: "CFR Title 27 - Vol 3", category: "Regulations", type: "pdf", lastUpdated: "2025-01-01", description: "Code of Federal Regulations - Continued" },
  { id: "DOC-004", name: "TTB Labelling Guide 2022", category: "Guidance", type: "pdf", lastUpdated: "2022-06-15", description: "Comprehensive labeling requirements and best practices" },
  { id: "DOC-005", name: "TTB Labelling Guide 2020", category: "Guidance", type: "pdf", lastUpdated: "2020-03-20", description: "Previous version of labeling guidance" },
  { id: "DOC-006", name: "TTB Permit Requirements", category: "Permits", type: "pdf", lastUpdated: "2006-09-01", description: "Federal permit requirements for importers" },
  { id: "DOC-007", name: "Alcohol Labeling FAQ", category: "FAQ", type: "md", lastUpdated: "2025-12-01", description: "Frequently asked questions about alcohol labeling" },
  { id: "DOC-008", name: "Labeling FAQ", category: "FAQ", type: "md", lastUpdated: "2025-12-01", description: "General labeling questions and answers" },
  { id: "DOC-009", name: "Other Compliance FAQ", category: "FAQ", type: "md", lastUpdated: "2025-12-01", description: "Miscellaneous compliance questions" },
];

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const SESSION_KEY = "ttb_session_id";
const CHAT_THREADS_KEY = "ttb_chat_threads_v1";
const REPORT_HISTORY_KEY = "ttb_report_history_v1";
const ACTIVE_CHAT_KEY = "ttb_active_chat_id_v1";
const UPLOAD_CONCURRENCY = 3;
const DEFAULT_CHAT_TITLE = "New chat";

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

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ============================================================================
// ICONS
// ============================================================================

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function ProductsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}


function CopilotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

function KnowledgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Home() {
  // Navigation state
  const [activeNav, setActiveNav] = useState<NavItem>("dashboard");

  // Session & chat state
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mode state: "chat" = new chat (no thread yet), "upload" = upload panel, "thread" = viewing existing thread
  const [copilotMode, setCopilotMode] = useState<"chat" | "upload" | "thread">("chat");
  
  // Stable ID for new chats (generated once, reused until thread is created)
  const [pendingChatId, setPendingChatId] = useState<string>(() => uuidv4());
  
  // Track which thread is currently being analyzed (for showing loading state)
  const [analyzingThreadId, setAnalyzingThreadId] = useState<string | null>(null);

  // Filter state for products
  const [productStatusFilter, setProductStatusFilter] = useState<string>("all");
  const [productSearchQuery, setProductSearchQuery] = useState<string>("");

  // Filter state for knowledgebase
  const [docCategoryFilter, setDocCategoryFilter] = useState<string>("all");
  const [docSearchQuery, setDocSearchQuery] = useState<string>("");

  // Initialize session
  useEffect(() => {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(SESSION_KEY, id);
    }
    setSessionId(id);
  }, []);

  useEffect(() => {
    const storedChatsRaw = loadFromStorage<ChatThread[]>(CHAT_THREADS_KEY, []);
    const storedReports = loadFromStorage<ReportEntry[]>(REPORT_HISTORY_KEY, []);
    const storedChats = storedChatsRaw.map((thread) => ({
      ...thread,
      kind: thread.kind ?? (thread.reportId ? "report" : "chat"),
    }));
    // Filter out any draft threads that don't have content
    const persistedChats = storedChats.filter((thread) => !thread.autoTitle || thread.reportId);

    const storedActiveChatId = localStorage.getItem(ACTIVE_CHAT_KEY);
    let nextActiveChatId = "";
    let nextActiveReportId: string | null = null;
    let nextMode: "chat" | "upload" | "thread" = "chat";

    if (storedActiveChatId && persistedChats.some((thread) => thread.id === storedActiveChatId)) {
      nextActiveChatId = storedActiveChatId;
      const selectedChat = persistedChats.find((thread) => thread.id === storedActiveChatId);
      nextActiveReportId = selectedChat?.reportId ?? null;
      nextMode = "thread";
    } else if (persistedChats.length > 0) {
      // Default to most recent thread
      const sorted = [...persistedChats].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      nextActiveChatId = sorted[0].id;
      nextActiveReportId = sorted[0].reportId ?? null;
      nextMode = "thread";
    }

    setChatThreads(persistedChats);
    setReportHistory(storedReports);
    setActiveChatId(nextActiveChatId);
    setActiveReportId(nextActiveReportId);
    setCopilotMode(nextMode);
  }, []);

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

  // Computed values
  const hasReadyFiles = files.some((f) => f.status === "ready");
  const hasUploadingFiles = files.some((f) => f.status === "uploading" || f.status === "processing");
  const hasImages = files.some((f) => f.isImage && f.status === "ready");
  const isUploadMode = copilotMode === "upload";
  const isNewChatMode = copilotMode === "chat";
  const isViewingAnalyzingThread = activeChatId === analyzingThreadId && analyzingThreadId !== null;
  const showUploadPanel = isUploadMode && !isAnalyzing && !report && !analysisError;
  const activeThread = useMemo(
    () => chatThreads.find((thread) => thread.id === activeChatId) || null,
    [chatThreads, activeChatId]
  );
  const isPendingReportThread = Boolean(
    activeThread && activeThread.kind === "report" && !activeThread.reportId
  );
  const reportLoading = (isViewingAnalyzingThread && isAnalyzing) || isPendingReportThread;
  const reportError = isViewingAnalyzingThread ? analysisError : null;
  const activeReportEntry = useMemo(
    () => reportHistory.find((entry) => entry.id === activeReportId) || null,
    [reportHistory, activeReportId]
  );

  const chatVectorStoreId = useMemo(() => {
    if (isUploadMode) {
      return vectorStoreId || "";
    }
    if (activeReportId) {
      return activeReportEntry?.vectorStoreId ?? "";
    }
    return "";
  }, [activeReportId, vectorStoreId, activeReportEntry, isUploadMode]);

  const sortedChatThreads = useMemo(
    () =>
      [...chatThreads].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [chatThreads]
  );

  const visibleChatThreads = useMemo(
    () =>
      sortedChatThreads.filter((thread) => {
        // Show threads with completed reports
        if (thread.reportId) return true;
        // Show report threads that are being analyzed (no reportId yet but kind is report)
        if (thread.kind === "report" && !thread.reportId) return true;
        // Show chats only after they have content (not autoTitle)
        if (thread.kind === "chat") return !thread.autoTitle;
        return false;
      }),
    [sortedChatThreads]
  );

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
    if (!isUploadMode) {
      return [];
    }
    return draftChatImages;
  }, [draftChatImages, isUploadMode]);

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

  // Called when user sends first message - creates thread if needed
  const handleChatActivity = useCallback((chatId: string, content: string) => {
    const now = new Date().toISOString();
    
    // Check if this is a new chat (chatId might be temporary)
    const existingThread = chatThreads.find((t) => t.id === chatId);
    
    if (!existingThread) {
      // Create new thread for first message
      const newThread: ChatThread = {
        id: chatId,
        title: deriveChatTitle(content),
        createdAt: now,
        updatedAt: now,
        reportId: null,
        kind: "chat",
        autoTitle: false,
      };
      setChatThreads((prev) => [newThread, ...prev]);
      setActiveChatId(chatId);
      setCopilotMode("thread");
    } else {
      // Update existing thread
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
    }
  }, [chatThreads]);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setActiveChatId(chatId);
      const selected = chatThreads.find((thread) => thread.id === chatId);
      setActiveReportId(selected?.reportId ?? null);
      setFocusFindingId(undefined);
      setCopilotMode("thread");
      // Clear upload state when switching threads (unless it's the analyzing thread)
      if (chatId !== analyzingThreadId) {
        setFiles([]);
        setVectorStoreId(undefined);
      }
      setReport(selected?.reportId ? reportHistory.find((r) => r.id === selected.reportId)?.report ?? null : null);
      // Clear error when switching to a different thread
      if (chatId !== analyzingThreadId) {
        setAnalysisError(null);
      }
    },
    [chatThreads, reportHistory, analyzingThreadId]
  );

  // Start a new chat - doesn't create thread until first message
  const handleNewChat = useCallback(() => {
    setActiveChatId("");
    setActiveReportId(null);
    setFocusFindingId(undefined);
    setCopilotMode("chat");
    setReport(null);
    setFiles([]);
    setVectorStoreId(undefined);
    setAnalysisError(null);
    setPendingChatId(uuidv4()); // Generate new ID for new chat
  }, []);

  // Switch to upload mode - doesn't create thread until analysis completes
  const handleStartUpload = useCallback(() => {
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
    setActiveChatId("");
    setCopilotMode("upload");
  }, []);

  const handleDeleteChat = useCallback(
    (chatId: string) => {
      const thread = chatThreads.find((t) => t.id === chatId);
      const reportId = thread?.reportId;
      
      setChatThreads((prev) => {
        const remaining = prev.filter((t) => t.id !== chatId);
        if (chatId === activeChatId) {
          if (remaining.length === 0) {
            // No threads left, go to new chat mode
            setActiveChatId("");
            setActiveReportId(null);
            setCopilotMode("chat");
          } else {
            // Select the next available thread
            const nextActive = remaining[0];
            setActiveChatId(nextActive.id);
            setActiveReportId(nextActive.reportId ?? null);
            setCopilotMode("thread");
          }
        }
        return remaining;
      });
      
      if (reportId) {
        setReportHistory((prev) => prev.filter((entry) => entry.id !== reportId));
      }
      clearChatMemory(chatId);
    },
    [activeChatId, chatThreads]
  );

  const handleAnalyze = async () => {
    if (!isUploadMode || !hasReadyFiles || isAnalyzing || !vectorStoreId || !hasImages) {
      return;
    }

    const now = new Date().toISOString();
    const readyFiles = files.filter((f) => f.status === "ready");
    
    // Derive title from first image file name
    const firstImageFile = readyFiles.find((f) => f.isImage);
    const pendingTitle = firstImageFile?.name || "Analyzing label...";
    
    // Create thread IMMEDIATELY so it shows in history
    const newThreadId = uuidv4();
    const newThread: ChatThread = {
      id: newThreadId,
      title: pendingTitle,
      createdAt: now,
      updatedAt: now,
      reportId: null, // Will be set when analysis completes
      kind: "report",
      autoTitle: false,
    };
    setChatThreads((prev) => [newThread, ...prev]);
    
    // Switch to viewing this thread
    setActiveChatId(newThreadId);
    setActiveReportId(null);
    setCopilotMode("thread");
    setAnalyzingThreadId(newThreadId);
    setIsAnalyzing(true);
    setAnalysisError(null);

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
      
      // Create report entry
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
      
      // Update the thread with the report ID and final title
      const completedAt = new Date().toISOString();
      setChatThreads((prev) =>
        prev.map((thread) =>
          thread.id === newThreadId
            ? { ...thread, reportId: result.run_id, title: reportTitle, updatedAt: completedAt }
            : thread
        )
      );
      
      setActiveReportId(result.run_id);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis failed");
      // Keep the thread but mark it as failed (user can retry or delete)
    } finally {
      setIsAnalyzing(false);
      setAnalyzingThreadId(null);
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
        doc.description.toLowerCase().includes(docSearchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [docCategoryFilter, docSearchQuery]);

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

  // Loading state - only need sessionId now
  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: SIDEBAR
  // ============================================================================

  const navItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <DashboardIcon className="w-5 h-5" /> },
    { id: "products", label: "Products", icon: <ProductsIcon className="w-5 h-5" /> },
    { id: "copilot", label: "AI Copilot", icon: <CopilotIcon className="w-5 h-5" /> },
    { id: "knowledgebase", label: "TTB Knowledgebase", icon: <KnowledgeIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-sidebar flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b">
          <img 
            src="/gs_large_logo.png" 
            alt="Global Spirits" 
            className="h-9 w-auto object-contain"
          />
          <div>
            <h1 className="text-sm font-semibold text-sidebar-foreground">TTB Compliance</h1>
            <p className="text-[11px] text-muted-foreground">Import Portal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                activeNav === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar size="sm">
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">John Doe</p>
              <p className="text-xs text-muted-foreground truncate">Compliance Manager</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b bg-background flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <Select defaultValue="global">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global Spirits</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search..." className="pl-9 w-64" />
            </div>
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {/* ================================================================
              DASHBOARD
          ================================================================ */}
          {activeNav === "dashboard" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
                <p className="text-muted-foreground">Overview of your compliance pipeline</p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Products</CardDescription>
                    <CardTitle className="text-3xl">{kpiData.total}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Across all markets</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>In Review</CardDescription>
                    <CardTitle className="text-3xl text-blue-600">{kpiData.inReview}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Pending TTB approval</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Blockers</CardDescription>
                    <CardTitle className="text-3xl text-destructive">{kpiData.blocked}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Requiring action</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Avg. Days in Stage</CardDescription>
                    <CardTitle className="text-3xl">{kpiData.avgDays}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Active products</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stage Distribution (Mocked Chart) */}
                <Card>
                  <CardHeader>
                    <CardTitle>Stage Distribution</CardTitle>
                    <CardDescription>Products by compliance stage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { stage: "Formula Approval", count: 2, color: "bg-orange-500" },
                        { stage: "COLA/Labeling", count: 2, color: "bg-blue-500" },
                        { stage: "Import/Customs", count: 1, color: "bg-purple-500" },
                        { stage: "State Approvals", count: 1, color: "bg-green-500" },
                        { stage: "Complete", count: 2, color: "bg-emerald-500" },
                      ].map((item) => (
                        <div key={item.stage} className="flex items-center gap-3">
                          <div className={cn("w-3 h-3 rounded-full", item.color)} />
                          <span className="flex-1 text-sm">{item.stage}</span>
                          <span className="text-sm font-medium">{item.count}</span>
                          <div className="w-24">
                            <Progress value={(item.count / 8) * 100} className="h-2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Blockers */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Blockers</CardTitle>
                    <CardDescription>Issues requiring immediate attention</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {MOCK_BLOCKERS.map((blocker) => (
                        <div key={blocker.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                          <AlertIcon className={cn(
                            "w-5 h-5 mt-0.5 shrink-0",
                            blocker.severity === "critical" ? "text-destructive" :
                            blocker.severity === "high" ? "text-orange-500" : "text-yellow-500"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{blocker.productName}</p>
                            <p className="text-xs text-muted-foreground truncate">{blocker.issue}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant={
                                blocker.severity === "critical" ? "destructive" :
                                blocker.severity === "high" ? "default" : "secondary"
                              } className="text-[10px]">
                                {blocker.severity}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{blocker.daysOpen}d open</span>
                            </div>
                          </div>
                          <Avatar size="sm">
                            <AvatarFallback className="text-[10px]">{blocker.ownerInitials}</AvatarFallback>
                          </Avatar>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest compliance updates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {MOCK_ACTIVITIES.map((activity) => (
                      <div key={activity.id} className="flex items-center gap-4">
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <span className="font-medium">{activity.action}</span>
                            {" - "}
                            <span className="text-muted-foreground">{activity.product}</span>
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{activity.user}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(activity.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ================================================================
              PRODUCTS
          ================================================================ */}
          {activeNav === "products" && (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Products</h2>
                  <p className="text-muted-foreground">Manage your product compliance pipeline</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    className="pl-9"
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={productStatusFilter} onValueChange={setProductStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Products Table */}
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Stage</TableHead>
                      <TableHead>Days in Stage</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>
                          <Badge variant={
                            product.status === "approved" ? "default" :
                            product.status === "in_review" ? "secondary" :
                            product.status === "blocked" ? "destructive" : "outline"
                          } className={
                            product.status === "approved" ? "bg-emerald-500 hover:bg-emerald-600" : ""
                          }>
                            {product.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{product.stage}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ClockIcon className="w-4 h-4 text-muted-foreground" />
                            {product.daysInStage}d
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm">
                              <AvatarFallback className="text-[10px]">{product.ownerInitials}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{product.owner}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{product.lastUpdated}</TableCell>
                        <TableCell>
                          <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* ================================================================
              AI COPILOT (Chat + Label Analysis)
          ================================================================ */}
          {activeNav === "copilot" && (
            <div className="p-6 h-[calc(100vh-4rem)]">
              <div className="h-full flex gap-6">
                {/* Main chat/report area */}
                <div className="flex-1 flex gap-6 min-w-0">
                  {/* Upload Mode - Show upload panel */}
                  {isUploadMode && (
                    <div className="flex-1 min-w-0">
                      {showUploadPanel ? (
                        <Card className="h-full">
                          <CardHeader>
                            <CardTitle>Upload Label Assets</CardTitle>
                            <CardDescription>
                              Drop label images (PNG, JPG, WebP) and optional supporting PDFs. Include front/back labels for best results.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            {/* Upload area */}
                            <div
                              className="border-2 border-dashed border-muted rounded-xl p-8 text-center hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors"
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
                              <svg className="mx-auto h-12 w-12 text-muted-foreground mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              <p className="text-muted-foreground mb-1">Click to upload or drag and drop</p>
                              <p className="text-sm text-muted-foreground">PNG, JPG, WEBP, PDF up to 20MB each</p>
                            </div>

                            {/* File list */}
                            {files.length > 0 && (
                              <div className="space-y-3">
                                <h3 className="text-sm font-medium">Files ({files.length})</h3>
                                <ul className="space-y-2">
                                  {files.map((file) => (
                                    <li key={file.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                      <div className="flex items-center gap-3">
                                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", file.isImage ? "bg-blue-100" : "bg-blue-100/70")}>
                                          {file.isImage ? (
                                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                          ) : (
                                            <FileIcon className="w-5 h-5 text-blue-600" />
                                          )}
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium">{file.name}</p>
                                          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}{file.isImage && " • Label"}</p>
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
                                        {file.status === "error" && <span className="text-xs text-destructive">{file.error}</span>}
                                        <button onClick={() => removeFile(file.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
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
                              <div>
                                <label className="block text-sm font-medium mb-1">
                                  Additional Notes (Optional)
                                </label>
                                <textarea
                                  value={context.additionalNotes}
                                  onChange={(e) => setContext({ ...context, additionalNotes: e.target.value })}
                                  placeholder="Any specific concerns to check..."
                                  rows={2}
                                  className="w-full px-3 py-2 text-sm border rounded-lg bg-background placeholder-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                                />
                              </div>
                            )}

                            {/* Analyze button */}
                            <div className="flex justify-end">
                              <button
                                onClick={handleAnalyze}
                                disabled={!hasReadyFiles || hasUploadingFiles || !hasImages || isAnalyzing}
                                className={cn(
                                  "px-6 py-3 rounded-lg font-semibold transition-all",
                                  !hasReadyFiles || hasUploadingFiles || !hasImages || isAnalyzing
                                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                )}
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
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className="h-full overflow-auto">
                          <CardContent className="p-6">
                            <ResultsPanel
                              report={report}
                              isLoading={reportLoading}
                              error={reportError}
                              onAskAboutFinding={handleAskAboutFinding}
                            />
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}

                  {/* Chat Mode (new chat or existing thread) */}
                  {(isNewChatMode || copilotMode === "thread") && (
                    <>
                      {/* Show loading/results panel when viewing an analyzing thread or a thread with a report */}
                      {(isViewingAnalyzingThread || report) ? (
                        <>
                          <div className="flex-1 min-w-0">
                            <Card className="h-full flex flex-col overflow-hidden">
                              <ChatPanel
                                chatId={activeChatId || pendingChatId}
                                sessionId={sessionId}
                                vectorStoreId={chatVectorStoreId}
                                report={report}
                                images={activeChatImages}
                                isReportLoading={reportLoading}
                                onJumpToFinding={handleJumpToFinding}
                                focusFindingId={focusFindingId}
                                onClearFocus={handleClearFocus}
                                onChatActivity={handleChatActivity}
                              />
                            </Card>
                          </div>
                          <div className="flex-1 min-w-0">
                            <Card className="h-full overflow-auto">
                              <CardContent className="p-6">
                                <ResultsPanel
                                  report={report}
                                  isLoading={reportLoading}
                                  error={reportError}
                                  onAskAboutFinding={handleAskAboutFinding}
                                />
                              </CardContent>
                            </Card>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <Card className="h-full flex flex-col overflow-hidden">
                            <ChatPanel
                              chatId={activeChatId || pendingChatId}
                              sessionId={sessionId}
                              vectorStoreId={chatVectorStoreId}
                              report={report}
                              images={activeChatImages}
                              isReportLoading={reportLoading}
                              onJumpToFinding={handleJumpToFinding}
                              focusFindingId={focusFindingId}
                              onClearFocus={handleClearFocus}
                              onChatActivity={handleChatActivity}
                            />
                          </Card>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Chat threads sidebar - RIGHT SIDE */}
                <div className="w-72 shrink-0">
                  <Card className="h-full flex flex-col overflow-hidden">
                    <CardHeader className="pb-3 shrink-0">
                      <CardTitle className="text-base">Conversations</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col p-3 pt-0 min-h-0">
                      <div className="grid grid-cols-2 gap-2 mb-4 shrink-0">
                        <button
                          onClick={handleNewChat}
                          className={cn(
                            "px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                            isNewChatMode
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-primary/20 text-primary hover:bg-primary/5"
                          )}
                        >
                          New chat
                        </button>
                        <button
                          onClick={handleStartUpload}
                          className={cn(
                            "px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                            isUploadMode
                              ? "border-blue-500 bg-blue-50 text-blue-600"
                              : "border-blue-500/20 text-blue-600 hover:bg-blue-50"
                          )}
                        >
                          Analyze Label
                        </button>
                      </div>

                      <ScrollArea className="flex-1 min-h-0">
                        {visibleChatThreads.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-2">No conversations yet.</p>
                        ) : (
                          <div className="space-y-1 pr-2">
                            {visibleChatThreads.map((thread) => {
                              const isActive = thread.id === activeChatId && copilotMode === "thread";
                              const isThreadAnalyzing =
                                thread.id === analyzingThreadId ||
                                (thread.kind === "report" && !thread.reportId);
                              const statusLabel = isThreadAnalyzing 
                                ? "Analyzing..." 
                                : thread.reportId 
                                  ? "Report" 
                                  : "Chat";
                              const statusDot = isThreadAnalyzing
                                ? "bg-orange-500 animate-pulse"
                                : thread.reportId 
                                  ? "bg-blue-500" 
                                  : "bg-primary";
                              return (
                                <button
                                  key={thread.id}
                                  onClick={() => handleSelectChat(thread.id)}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg border transition-colors overflow-hidden",
                                    isActive
                                      ? "border-primary/30 bg-primary/5"
                                      : "border-transparent hover:bg-muted"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {isThreadAnalyzing && (
                                        <svg className="animate-spin h-3.5 w-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                      )}
                                      <div className="text-sm font-medium truncate min-w-0" title={thread.title || DEFAULT_CHAT_TITLE}>
                                        {thread.title || DEFAULT_CHAT_TITLE}
                                      </div>
                                    </div>
                                    {!isThreadAnalyzing && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDeleteChat(thread.id);
                                        }}
                                        className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-background transition-colors shrink-0"
                                        aria-label="Delete conversation"
                                      >
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot)} />
                                    <span className="truncate">{statusLabel}</span>
                                    {!isThreadAnalyzing && thread.updatedAt && (
                                      <span className="text-muted-foreground/60 shrink-0">
                                        · {formatShortDate(thread.updatedAt)}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TTB KNOWLEDGEBASE
          ================================================================ */}
          {activeNav === "knowledgebase" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">TTB Knowledgebase</h2>
                <p className="text-muted-foreground">Compliance documents and regulatory guidance</p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    className="pl-9"
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={docCategoryFilter} onValueChange={setDocCategoryFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Regulations">Regulations</SelectItem>
                    <SelectItem value="Guidance">Guidance</SelectItem>
                    <SelectItem value="Permits">Permits</SelectItem>
                    <SelectItem value="FAQ">FAQ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Documents Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocs.map((doc) => (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          doc.type === "pdf" ? "bg-red-100" : "bg-blue-100"
                        )}>
                          <FileIcon className={cn(
                            "w-5 h-5",
                            doc.type === "pdf" ? "text-red-600" : "text-blue-600"
                          )} />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm truncate">{doc.name}</CardTitle>
                          <CardDescription className="text-xs">{doc.category}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{doc.description}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">
                          {doc.type.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Updated {doc.lastUpdated}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
