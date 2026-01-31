// ============================================================================
// Types
// ============================================================================

export type NavItem = "dashboard" | "products" | "pilot" | "compliance" | "knowledgebase";

export type Product = {
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

export type Blocker = {
  id: string;
  productName: string;
  issue: string;
  severity: "critical" | "high" | "medium";
  owner: string;
  ownerInitials: string;
  daysOpen: number;
};

export type Activity = {
  id: string;
  action: string;
  product: string;
  user: string;
  timestamp: string;
};

export type KnowledgeDoc = {
  id: string;
  name: string;
  category: string;
  type: "pdf" | "md";
  lastUpdated: string;
  description: string;
  fileName: string;
  url: string;
};

export type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  autoTitle?: boolean;
};

export type ReportThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  reportId: string | null;
};

import type { ComplianceReport } from "@/lib/schema";

export type ReportEntry = {
  id: string;
  title: string;
  createdAt: string;
  report: ComplianceReport;
  vectorStoreId?: string;
};

export type AnalysisJobState = {
  status: "running" | "done" | "error";
  reportId?: string;
  vectorStoreId?: string;
  error?: string;
};

export type AnalysisStatusPayload = {
  status?: "running" | "done" | "error";
  report?: ComplianceReport;
  reportId?: string;
  vectorStoreId?: string;
  error?: string;
  threadId?: string;
};

// ============================================================================
// Mock Data
// ============================================================================

export const MOCK_PRODUCTS: Product[] = [
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

export const MOCK_BLOCKERS: Blocker[] = [
  { id: "BLK-001", productName: "Por La Gente Tequila Reposado", issue: "Missing agave source documentation", severity: "critical", owner: "Mike Torres", ownerInitials: "MT", daysOpen: 14 },
  { id: "BLK-002", productName: "Cumberland Falls Bourbon", issue: "Mashbill percentage verification pending", severity: "high", owner: "James Wilson", ownerInitials: "JW", daysOpen: 8 },
  { id: "BLK-003", productName: "KHOR DE LUXE Vodka 750ml", issue: "Country of origin labeling clarification", severity: "medium", owner: "Mike Torres", ownerInitials: "MT", daysOpen: 3 },
];

export const MOCK_ACTIVITIES: Activity[] = [
  { id: "ACT-001", action: "Submitted for COLA review", product: "KROL Potato Vodka 750ml", user: "James Wilson", timestamp: "2026-01-28T09:30:00Z" },
  { id: "ACT-002", action: "Label revision uploaded", product: "Por La Gente Tequila Blanco", user: "Sarah Chen", timestamp: "2026-01-28T08:15:00Z" },
  { id: "ACT-003", action: "Formula submitted", product: "Ameris Gin Original Mediterranean Recipe", user: "Sarah Chen", timestamp: "2026-01-27T16:45:00Z" },
  { id: "ACT-004", action: "COLA approved", product: "KHOR Platinum Vodka 1L", user: "System", timestamp: "2026-01-27T14:20:00Z" },
  { id: "ACT-005", action: "State approval received (NY)", product: "Odessa VSOP Brandy 750ml", user: "System", timestamp: "2026-01-27T11:00:00Z" },
];

export const MOCK_KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    id: "DOC-001",
    name: "CFR Title 27 - Volume 1 (2025)",
    category: "Regulations",
    type: "pdf",
    lastUpdated: "2025-04-01",
    description: "Official CFR Vol 1 covering FAA Act permits, labeling, and alcohol regulations.",
    fileName: "CFR-2025-title27-vol1.pdf",
    url: "https://www.govinfo.gov/content/pkg/CFR-2025-title27-vol1/pdf/CFR-2025-title27-vol1.pdf",
  },
  {
    id: "DOC-002",
    name: "CFR Title 27 - Volume 2 (2025)",
    category: "Regulations",
    type: "pdf",
    lastUpdated: "2025-04-01",
    description: "Official CFR Vol 2 covering tobacco product regulations and TTB procedures.",
    fileName: "CFR-2025-title27-vol2.pdf",
    url: "https://www.govinfo.gov/content/pkg/CFR-2025-title27-vol2/pdf/CFR-2025-title27-vol2.pdf",
  },
  {
    id: "DOC-003",
    name: "CFR Title 27 - Volume 3 (2025)",
    category: "Regulations",
    type: "pdf",
    lastUpdated: "2025-04-01",
    description: "Official CFR Vol 3 covering ATF firearms, explosives, and related regulations.",
    fileName: "CFR-2025-title27-vol3.pdf",
    url: "https://www.govinfo.gov/content/pkg/CFR-2025-title27-vol3/pdf/CFR-2025-title27-vol3.pdf",
  },
  {
    id: "DOC-004",
    name: "Distilled Spirits Labelling Guideline",
    category: "Guidance",
    type: "md",
    lastUpdated: "2025-07-31",
    description: "Checklist-style distilled spirits label rules compiled from TTB HTML guidance.",
    fileName: "labelling_guideline.md",
    url: "https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/labeling#Mandatory",
  },
  {
    id: "DOC-005",
    name: "TTB Labeling Modernization Rule (2022)",
    category: "Regulations",
    type: "pdf",
    lastUpdated: "2022-02-09",
    description: "Final rule modernizing distilled spirits and malt beverage labeling/advertising.",
    fileName: "ttb_labelling_2022.pdf",
    url: "https://www.federalregister.gov/documents/2022/02/09/2022-00841/modernization-of-the-labeling-and-advertising-regulations-for-distilled-spirits-and-malt-beverages",
  },
  {
    id: "DOC-006",
    name: "TTB Permit Requirements (2006)",
    category: "Permits",
    type: "pdf",
    lastUpdated: "2006-10-23",
    description: "2006 snapshot of 27 CFR Part 1 basic permit requirements and related rules.",
    fileName: "ttb_permit_requirements_2006.pdf",
    url: "https://www.ecfr.gov/current/title-27/part-1",
  },
  {
    id: "DOC-007",
    name: "Alcohol FAQs",
    category: "FAQ",
    type: "md",
    lastUpdated: "2011-08-01",
    description: "General TTB alcohol FAQs covering permits, taxes, and compliance basics.",
    fileName: "alcohol_faq.md",
    url: "https://www.ttb.gov/faqs/alcohol",
  },
  {
    id: "DOC-008",
    name: "Advertising, Labeling & Formulation FAQs",
    category: "FAQ",
    type: "md",
    lastUpdated: "2011-08-01",
    description: "ALFD FAQs for label approvals, formulas, and labeling/advertising requirements.",
    fileName: "labeling_faq.md",
    url: "https://www.ttb.gov/faqs/alcohol-labeling-and-formulation",
  },
  {
    id: "DOC-009",
    name: "Other Compliance FAQs",
    category: "FAQ",
    type: "md",
    lastUpdated: "2011-08-01",
    description: "Additional TTB FAQs for compliance topics that sit outside labeling and taxes.",
    fileName: "other_faq.md",
    url: "https://www.ttb.gov/faqs",
  },
];

// ============================================================================
// Constants
// ============================================================================

export const SESSION_KEY = "ttb_session_id";
export const CHAT_THREADS_KEY = "ttb_chat_threads_v2";
export const REPORT_THREADS_KEY = "ttb_report_threads_v2";
export const REPORT_HISTORY_KEY = "ttb_report_history_v2";
export const ACTIVE_CHAT_KEY = "ttb_active_chat_id_v2";
export const ACTIVE_REPORT_THREAD_KEY = "ttb_active_report_thread_id_v2";
export const UPLOAD_CONCURRENCY = 3;
export const DEFAULT_CHAT_TITLE = "New chat";

// ============================================================================
// Utility Functions
// ============================================================================

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function deriveChatTitle(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return DEFAULT_CHAT_TITLE;
  return firstLine.length > 52 ? `${firstLine.slice(0, 52)}…` : firstLine;
}

export function deriveReportTitle(report: ComplianceReport): string {
  const contextSummary = report.inputs.context_summary?.trim();
  if (contextSummary) return contextSummary;
  const labelName = report.inputs.label_files?.[0];
  if (labelName) return labelName;
  return `Report ${report.run_id.slice(0, 8)}`;
}

export function formatRelativeTime(timestamp: string): string {
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Icon Components
// ============================================================================

export function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

export function ProductsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

export function CopilotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

export function KnowledgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

export function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
