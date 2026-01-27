import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getOpenAIClient, runComplianceAnalysis, type AnalysisImage } from "@/lib/openai";
import { getRegulationsVectorStoreId } from "@/lib/regulations";
import {
  type AnalyzeRequest,
  type ComplianceReport,
  type Summary,
  ComplianceReportSchema,
  COMPLIANCE_REPORT_JSON_SCHEMA,
} from "@/lib/schema";

function buildUserPrompt(context: AnalyzeRequest["context"]): string {
  const contextParts: string[] = [];

  if (context.productName) contextParts.push(`Product: ${context.productName}`);
  if (context.productCategory) contextParts.push(`Category: ${context.productCategory}`);
  if (context.abv) contextParts.push(`ABV: ${context.abv}`);
  if (context.containerSize) contextParts.push(`Size: ${context.containerSize}`);
  if (context.producer) contextParts.push(`Producer: ${context.producer}`);
  if (context.additionalNotes) contextParts.push(`Notes: ${context.additionalNotes}`);

  return `Analyze the attached label image(s) for TTB compliance.

Product info: ${contextParts.length > 0 ? contextParts.join(", ") : "See label"}

Look at the label image and check against TTB regulations. Return up to 10 findings.
For each finding, cite the specific CFR section (e.g., "27 CFR 4.32(a)").
No duplicates - one finding per unique issue.`;
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { sessionId, vectorStoreId, context, images, readyFileNames } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    if (!vectorStoreId) {
      return NextResponse.json(
        { error: "No documents uploaded. Please upload files first." },
        { status: 400 }
      );
    }

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: "No label images provided." },
        { status: 400 }
      );
    }

    const client = getOpenAIClient();
    const runId = uuidv4();

    // Build the user prompt
    const userPrompt = buildUserPrompt(context);

    // Collect vector store IDs - regulations first (if configured), then user uploads
    const regulationsStoreId = getRegulationsVectorStoreId();
    const vectorStoreIds: string[] = [];
    
    if (regulationsStoreId) {
      vectorStoreIds.push(regulationsStoreId);
    }
    vectorStoreIds.push(vectorStoreId);

    // Convert images for analysis
    const analysisImages: AnalysisImage[] = images.map((img) => ({
      base64: img.base64,
      mimeType: img.mimeType,
      filename: img.filename,
    }));

    // Single combined call: image + file_search + JSON schema output
    const structuredContent = await runComplianceAnalysis(
      client,
      vectorStoreIds,
      userPrompt,
      analysisImages,
      COMPLIANCE_REPORT_JSON_SCHEMA as Record<string, unknown>
    );

    const structuredFindings = JSON.parse(structuredContent);

    // Build summary counts
    const summary: Summary = {
      blocker: 0,
      major: 0,
      minor: 0,
      info: 0,
      total: 0,
    };

    for (const finding of structuredFindings.findings || []) {
      const severity = finding.severity as keyof typeof summary;
      if (severity in summary && severity !== "total") {
        summary[severity]++;
      }
      summary.total++;
    }

    // Separate label files vs doc files from filenames (simple heuristic based on common extensions)
    const imageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    const labelFiles: string[] = [];
    const docFiles: string[] = [];

    for (const name of readyFileNames || []) {
      const isImage = imageExtensions.some((ext) => name.toLowerCase().endsWith(ext));
      if (isImage) {
        labelFiles.push(name);
      } else {
        docFiles.push(name);
      }
    }

    const report: ComplianceReport = {
      run_id: runId,
      created_at: new Date().toISOString(),
      inputs: {
        label_files: labelFiles,
        document_files: docFiles,
        context_summary:
          [context.productName, context.productCategory, context.abv, context.containerSize, context.producer]
            .filter(Boolean)
            .join(" | ") || undefined,
      },
      summary,
      findings: structuredFindings.findings || [],
      limitations: structuredFindings.limitations || [],
    };

    // Validate the report schema
    const validatedReport = ComplianceReportSchema.parse(report);

    return NextResponse.json(validatedReport);
  } catch (error) {
    console.error("Analysis error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
