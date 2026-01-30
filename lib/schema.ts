import { z } from "zod";

// ============================================================================
// Severity Configuration
// ============================================================================

export const SeveritySchema = z.enum(["blocker", "major", "minor", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_ORDER: Record<Severity, number> = {
  blocker: 0,
  major: 1,
  minor: 2,
  info: 3,
};

export const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; border: string }> = {
  blocker: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  major: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  minor: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  info: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
};

// ============================================================================
// Finding Schema (Simplified - focused on law citations with document references)
// ============================================================================

// Individual finding - focused on direct CFR citations with source document
export const FindingSchema = z.object({
  id: z.string(),
  severity: SeveritySchema,
  title: z.string(),
  issue: z.string(),
  regulation: z.string(), // CFR citation like "27 CFR 4.32(a)"
  requirement: z.string(),
  fix: z.string(),
  source: z.string(), // Filename of source document
});
export type Finding = z.infer<typeof FindingSchema>;

// Summary counts by severity
export const SummarySchema = z.object({
  blocker: z.number(),
  major: z.number(),
  minor: z.number(),
  info: z.number(),
  total: z.number(),
});
export type Summary = z.infer<typeof SummarySchema>;

// Input metadata
export const InputsSchema = z.object({
  label_files: z.array(z.string()),
  document_files: z.array(z.string()),
  context_summary: z.string().optional(),
});
export type Inputs = z.infer<typeof InputsSchema>;

// Limitations - structured for clear reporting
export const LimitationsSchema = z.object({
  missing_inputs: z.array(z.string()),
  unverified: z.array(z.string()),
  scope_notes: z.array(z.string()),
});
export type Limitations = z.infer<typeof LimitationsSchema>;

// Full compliance report
export const ComplianceReportSchema = z.object({
  run_id: z.string(),
  created_at: z.string(),
  inputs: InputsSchema,
  summary: SummarySchema,
  findings: z.array(FindingSchema),
  limitations: LimitationsSchema,
});
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;

// ============================================================================
// JSON Schema for OpenAI Structured Output
// ============================================================================

/**
 * Simplified JSON Schema - focused on direct law citations with document references
 */
export const COMPLIANCE_REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "F-001, F-002, etc." },
          severity: {
            type: "string",
            enum: ["blocker", "major", "minor", "info"],
          },
          title: { type: "string", description: "Short title (5-10 words max)" },
          issue: { type: "string", description: "What's wrong (1-2 sentences)" },
          regulation: {
            type: "string",
            description: "CFR citation only, e.g. '27 CFR 5.70(a)'",
            pattern: "^27 CFR \\d+\\.\\d+[a-z0-9]*(\\([a-z0-9]+\\))*$",
          },
          requirement: { type: "string", description: "What the regulation requires (1 sentence)" },
          fix: { type: "string", description: "How to fix (1 sentence)" },
          source: {
            type: "string",
            description: "Filename of the source document (e.g., 'CFR-2025-title27-vol1.pdf')",
          },
        },
        required: ["id", "severity", "title", "issue", "regulation", "requirement", "fix", "source"],
        additionalProperties: false,
      },
    },
    limitations: {
      type: "object",
      properties: {
        missing_inputs: { type: "array", items: { type: "string" } },
        unverified: { type: "array", items: { type: "string" } },
        scope_notes: { type: "array", items: { type: "string" } },
      },
      required: ["missing_inputs", "unverified", "scope_notes"],
      additionalProperties: false,
    },
  },
  required: ["findings", "limitations"],
  additionalProperties: false,
} as const;

// ============================================================================
// Client-Side Types (Minimal)
// ============================================================================

/**
 * Product details extracted from label
 */
export interface ExtractedDetails {
  productName: string;
  productCategory: string;
  abv: string;
  containerSize: string;
  producer: string;
}

/**
 * Uploaded file metadata (client-side tracking)
 */
export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  status: "pending" | "uploading" | "processing" | "ready" | "error";
  error?: string;
  extractedDetails?: ExtractedDetails;
  // For images: store base64 for analysis
  imageBase64?: string;
}

/**
 * Upload API response
 */
export interface UploadResponse {
  success: boolean;
  vectorStoreId: string;
  filename: string;
  isImage: boolean;
  extractedDetails?: ExtractedDetails;
  // Return image base64 for analysis
  imageBase64?: string;
}

// Session state
export interface SessionState {
  sessionId: string;
  vectorStoreId?: string;
  files: UploadedFile[];
}

// Context form data
export interface ContextFormData {
  productName: string;
  productCategory: string;
  abv: string;
  containerSize: string;
  producer: string;
  additionalNotes: string;
}

/**
 * Image for analysis
 */
export interface AnalysisImage {
  base64: string;
  mimeType: string;
  filename: string;
}

/**
 * Analysis request payload
 */
export interface AnalyzeRequest {
  sessionId?: string;
  threadId: string;
  vectorStoreId: string;
  context: ContextFormData;
  images: AnalysisImage[];
  readyFileNames?: string[];
}

// ============================================================================
// Chat Types
// ============================================================================

/**
 * Chat message role
 */
export const ChatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

/**
 * Chat message shape
 */
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: ChatRoleSchema,
  content: z.string(),
  createdAt: z.string(),
  focusFindingId: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Chat image for context
 */
export const ChatImageSchema = z.object({
  base64: z.string(),
  mimeType: z.string(),
  filename: z.string(),
});
export type ChatImage = z.infer<typeof ChatImageSchema>;

/**
 * Chat request payload
 */
export const ChatRequestSchema = z.object({
  chatId: z.string(),
  vectorStoreId: z.string(),
  report: ComplianceReportSchema.nullable(),
  content: z.string(),
  focusFindingId: z.string().optional(),
  images: z.array(ChatImageSchema).optional(), // Label images for context
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/**
 * Chat response payload
 */
export interface ChatResponse {
  assistantMessage: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Quick prompts for empty chat state
 */
export const QUICK_PROMPTS = [
  "Summarize the blockers",
  "What's the highest-risk issue?",
  "Generate exact replacement wording for the Government Warning",
  "Explain the most critical CFR sections that apply",
] as const;
