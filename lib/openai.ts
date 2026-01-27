import OpenAI, { toFile } from "openai";

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Model constants - single source of truth for all OpenAI calls
 */
export const MODEL_TEXT = "gpt-5.2";          // Main analysis model
export const MODEL_VISION = "gpt-4o-mini";    // Fast vision model for OCR

/**
 * Reasoning configuration - disabled for speed
 */
export const REASONING_CONFIG = { effort: "none" } as const;

// ============================================================================
// Client Initialization
// ============================================================================

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// System instructions for TTB compliance analysis
export const COMPLIANCE_INSTRUCTIONS = `You are a TTB compliance analyst. Analyze the label against TTB regulations.

## Rules
1. **Cite specific regulations** - Use CFR section numbers (e.g., "27 CFR 4.32(a)")
2. **No duplicates** - One finding per issue, even if multiple regulations apply
3. **Be concise** - Short titles, brief summaries
4. **Max 10 findings** - Focus on most significant issues only
5. **Severity levels**:
   - BLOCKER: Will cause rejection
   - MAJOR: Likely rejection
   - MINOR: Recommended fix
   - INFO: Suggestion only

## Key Areas (27 CFR Part 4 for wine, Part 5 for spirits, Part 7 for malt beverages)
- Mandatory statements: Government Warning, net contents, ABV, responsible party
- Class/type designation
- Prohibited claims
- Font size requirements`;

// Chat-specific instructions for follow-up discussions
export const CHAT_INSTRUCTIONS = `You are a TTB compliance assistant helping users understand and fix issues found in their alcohol beverage label analysis.

## Your Role
You explain compliance findings in plain language, suggest concrete label edits, and answer targeted questions about CFR citations. You use document retrieval when needed to quote and cite relevant regulatory sources.

## Rules
1. **Stay scoped** - If a compliance report is provided, keep answers focused on it and the regulations
2. **No report behavior** - If no report is provided, answer general regulatory questions and suggest running an analysis for label-specific guidance
3. **Reference finding IDs** - When discussing a specific issue, reference it by ID (e.g., "F-003")
4. **No new findings** - Do not invent new compliance issues; if the user raises a new concern, advise them to run a new analysis
5. **Cite regulations** - Always include the CFR section number when recommending a change
6. **Be actionable** - When the user asks "what should I do?", include short "Suggested next steps"
7. **Be concise** - Keep responses clear and to the point

## Legal Disclaimer
If asked for legal conclusions, remind the user that this tool provides guidance only and does not constitute legal advice. They should consult with a qualified attorney or TTB directly for official compliance determinations.

## Response Format
- Use markdown formatting for clarity (bullet points, bold for emphasis)
- When suggesting text changes, show the exact wording to use
- When citing regulations, format as: **27 CFR X.XX(x)**`;

const CHAT_IMAGE_NOTE =
  "\n\nIMPORTANT: You have access to the actual label images. When the user asks about specific text or visual elements on the label, refer to these images directly to provide accurate answers.";

// Create a vector store for session uploads
export async function createSessionVectorStore(
  client: OpenAI,
  sessionId: string
): Promise<string> {
  const vectorStore = await client.vectorStores.create({
    name: `ttb-session-${sessionId}`,
    expires_after: {
      anchor: "last_active_at",
      days: 1, // Session stores expire after 1 day of inactivity
    },
  });

  return vectorStore.id;
}

// Upload file to OpenAI and add to vector store (non-blocking)
export async function uploadFileToVectorStore(
  client: OpenAI,
  vectorStoreId: string,
  fileBuffer: ArrayBuffer,
  filename: string,
  mimeType: string
): Promise<string> {
  // Convert ArrayBuffer to proper file format for OpenAI SDK
  const file = await toFile(Buffer.from(fileBuffer), filename, { type: mimeType });

  // Upload the file to OpenAI
  const uploadedFile = await client.files.create({
    file: file,
    purpose: "assistants",
  });

  // Add to vector store - don't wait for processing (faster)
  // The file will be ready by the time analysis runs
  client.vectorStores.files.create(vectorStoreId, {
    file_id: uploadedFile.id,
  }).catch(err => console.error("Vector store add error:", err));

  return uploadedFile.id;
}

// ============================================================================
// Image Processing - Fast OCR
// ============================================================================

/**
 * Image extraction result
 */
export interface ImageExtractionResult {
  extractedText: string;
  extractedDetails: {
    productName: string;
    productCategory: string;
    abv: string;
    containerSize: string;
    producer: string;
  };
}

/**
 * Fast text extraction from label image
 * Uses simple prompt for speed
 */
export async function extractFromLabelImage(
  client: OpenAI,
  imageBase64: string,
  mimeType: string
): Promise<ImageExtractionResult> {
  const response = await client.responses.create({
    model: MODEL_VISION,
    temperature: 0,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Read all text on this alcohol label. Format: JSON with fields extracted_text (string), product_name, category, abv, size, producer.",
          },
          {
            type: "input_image",
            image_url: `data:${mimeType};base64,${imageBase64}`,
            detail: "high",
          },
        ],
      },
    ],
  });

  // Parse response - be flexible with format
  const text = response.output_text || "";
  
  // Try to extract JSON from response
  let extractedText = text;
  let details = { productName: "", productCategory: "", abv: "", containerSize: "", producer: "" };
  
  try {
    // Look for JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      extractedText = parsed.extracted_text || parsed.text || text;
      details = {
        productName: parsed.product_name || parsed.productName || "",
        productCategory: parsed.category || parsed.productCategory || "",
        abv: parsed.abv || "",
        containerSize: parsed.size || parsed.containerSize || "",
        producer: parsed.producer || "",
      };
    }
  } catch {
    // If parsing fails, just use the raw text
    extractedText = text;
  }

  return { extractedText, extractedDetails: details };
}

// ============================================================================
// Compliance Analysis - Single Combined Call with Image
// ============================================================================

/**
 * Image data for analysis
 */
export interface AnalysisImage {
  base64: string;
  mimeType: string;
  filename: string;
}

/**
 * Run compliance analysis with image + file_search + JSON schema output
 * The model sees the actual label image for direct analysis
 * 
 * @param client - OpenAI client
 * @param vectorStoreIds - Array of vector store IDs to search
 * @param userPrompt - The analysis prompt
 * @param images - Array of label images to analyze
 * @param jsonSchema - JSON schema for structured output
 */
export async function runComplianceAnalysis(
  client: OpenAI,
  vectorStoreIds: string[],
  userPrompt: string,
  images: AnalysisImage[],
  jsonSchema: Record<string, unknown>
): Promise<string> {
  // Filter out empty/undefined IDs
  const validStoreIds = vectorStoreIds.filter((id) => id && id.trim() !== "");

  // Build input content - text prompt + images
  const inputContent: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" | "low" }
  > = [
    { type: "input_text", text: userPrompt },
  ];

  // Add images
  for (const img of images) {
    inputContent.push({
      type: "input_image",
      image_url: `data:${img.mimeType};base64,${img.base64}`,
      detail: "high",
    });
  }

  const response = await client.responses.create({
    model: MODEL_TEXT,
    reasoning: REASONING_CONFIG,
    temperature: 0,
    instructions: COMPLIANCE_INSTRUCTIONS,
    input: [{ role: "user", content: inputContent }],
    tools: validStoreIds.length > 0 ? [
      {
        type: "file_search",
        vector_store_ids: validStoreIds,
      },
    ] : undefined,
    text: {
      format: {
        type: "json_schema",
        name: "compliance_report",
        strict: true,
        schema: jsonSchema,
      },
    },
  });

  return response.output_text || "{}";
}

// ============================================================================
// Chat - Follow-up Discussion
// ============================================================================

import type { ComplianceReport, ChatMessage, Finding } from "./schema";

/**
 * Build a compact report context for chat
 */
function buildReportContext(report: ComplianceReport | null, focusFindingId?: string): string {
  if (!report) {
    return `## Compliance Context
No compliance report is available yet. Provide general TTB labeling guidance and suggest running an analysis for label-specific recommendations.`;
  }

  const findingsSummary = report.findings.map((f: Finding) => 
    `- ${f.id} [${f.severity.toUpperCase()}]: ${f.title}\n  Issue: ${f.issue}\n  Regulation: ${f.regulation}\n  Fix: ${f.fix}`
  ).join("\n");

  let context = `## Compliance Report Context
Run ID: ${report.run_id}
Created: ${report.created_at}
Summary: ${report.summary.blocker} blockers, ${report.summary.major} major, ${report.summary.minor} minor, ${report.summary.info} info

## Findings
${findingsSummary}`;

  // If focusing on a specific finding, add emphasis
  if (focusFindingId) {
    const focusFinding = report.findings.find((f: Finding) => f.id === focusFindingId);
    if (focusFinding) {
      context += `\n\n## FOCUS: ${focusFinding.id}
The user is asking specifically about this finding:
- Severity: ${focusFinding.severity.toUpperCase()}
- Title: ${focusFinding.title}
- Issue: ${focusFinding.issue}
- Regulation: ${focusFinding.regulation}
- Requirement: ${focusFinding.requirement}
- Suggested Fix: ${focusFinding.fix}
- Source: ${focusFinding.source}`;
    }
  }

  return context;
}

function buildChatInput(
  report: ComplianceReport | null,
  messages: ChatMessage[],
  focusFindingId?: string,
  images?: AnalysisImage[]
): Array<{
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string; detail: "high" | "low" }
      >;
}> {
  const reportContext = buildReportContext(report, focusFindingId);
  const chatMessages = buildChatMessages(reportContext, messages);

  // Limit to last 20 messages to control context size
  const limitedMessages = chatMessages.slice(-20);

  // Build input with images on the first message
  const input: Array<{
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "input_text"; text: string }
          | { type: "input_image"; image_url: string; detail: "high" | "low" }
        >;
  }> = [];

  for (let i = 0; i < limitedMessages.length; i++) {
    const msg = limitedMessages[i];

    // On the first user message, include images if available
    if (i === 0 && msg.role === "user" && images && images.length > 0) {
      const contentParts: Array<
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string; detail: "high" | "low" }
      > = [{ type: "input_text", text: msg.content }];

      // Add images
      for (const img of images) {
        contentParts.push({
          type: "input_image",
          image_url: `data:${img.mimeType};base64,${img.base64}`,
          detail: "high",
        });
      }

      input.push({ role: msg.role, content: contentParts });
    } else {
      input.push({ role: msg.role, content: msg.content });
    }
  }

  return input;
}

/**
 * Build conversation messages for OpenAI API
 */
function buildChatMessages(
  reportContext: string,
  messages: ChatMessage[]
): Array<{ role: "user" | "assistant"; content: string }> {
  const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  
  // Add report context as first user message (will be combined with first actual user message)
  const contextPrefix = `${reportContext}\n\n---\n\n`;
  
  // Convert chat messages, prepending context to first user message
  let contextAdded = false;
  for (const msg of messages) {
    if (msg.role === "user" && !contextAdded) {
      chatMessages.push({
        role: "user",
        content: contextPrefix + msg.content,
      });
      contextAdded = true;
    } else {
      chatMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }
  
  return chatMessages;
}

/**
 * Run compliance chat - answer follow-up questions about findings
 * 
 * @param client - OpenAI client
 * @param vectorStoreIds - Array of vector store IDs (regulations + user uploads)
 * @param report - The compliance report being discussed
 * @param messages - Chat history
 * @param focusFindingId - Optional finding ID to focus on
 * @param images - Optional label images for visual context
 */
export async function runComplianceChat(
  client: OpenAI,
  vectorStoreIds: string[],
  report: ComplianceReport | null,
  messages: ChatMessage[],
  focusFindingId?: string,
  images?: AnalysisImage[]
): Promise<string> {
  // Filter out empty/undefined IDs
  const validStoreIds = vectorStoreIds.filter((id) => id && id.trim() !== "");

  const input = buildChatInput(report, messages, focusFindingId, images);

  const response = await client.responses.create({
    model: MODEL_TEXT,
    reasoning: REASONING_CONFIG,
    temperature: 0,
    instructions: CHAT_INSTRUCTIONS + CHAT_IMAGE_NOTE,
    input,
    tools: validStoreIds.length > 0 ? [
      {
        type: "file_search",
        vector_store_ids: validStoreIds,
      },
    ] : undefined,
  });

  return response.output_text || "I apologize, but I couldn't generate a response. Please try rephrasing your question.";
}

/**
 * Stream compliance chat responses
 */
export async function runComplianceChatStream(
  client: OpenAI,
  vectorStoreIds: string[],
  report: ComplianceReport | null,
  messages: ChatMessage[],
  focusFindingId?: string,
  images?: AnalysisImage[]
): Promise<AsyncIterable<string>> {
  const validStoreIds = vectorStoreIds.filter((id) => id && id.trim() !== "");
  const input = buildChatInput(report, messages, focusFindingId, images);

  const stream = await client.responses.create({
    model: MODEL_TEXT,
    reasoning: REASONING_CONFIG,
    temperature: 0,
    instructions: CHAT_INSTRUCTIONS + CHAT_IMAGE_NOTE,
    input,
    tools: validStoreIds.length > 0 ? [
      {
        type: "file_search",
        vector_store_ids: validStoreIds,
      },
    ] : undefined,
    stream: true,
  });

  async function* iterator() {
    for await (const event of stream as AsyncIterable<{ type: string; delta?: string }>) {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        yield event.delta;
      }
    }
  }

  return iterator();
}
