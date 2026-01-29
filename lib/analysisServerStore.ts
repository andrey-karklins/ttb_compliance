import { randomUUID } from "crypto";
import type { AnalysisImage } from "@/lib/openai";
import { getOpenAIClient, runComplianceAnalysis } from "@/lib/openai";
import { getRegulationsVectorStoreId } from "@/lib/regulations";
import type { AnalyzeRequest, ComplianceReport, Summary } from "@/lib/schema";
import { ComplianceReportSchema, COMPLIANCE_REPORT_JSON_SCHEMA } from "@/lib/schema";

type AnalysisStatus = "running" | "done" | "error";

type AnalysisJob = {
  id: string;
  threadId: string;
  userId: string;
  vectorStoreId: string;
  status: AnalysisStatus;
  reportId: string;
  createdAt: number;
  updatedAt: number;
  report?: ComplianceReport;
  error?: string;
};

type AnalysisJobSummary = {
  id: string;
  threadId: string;
  status: AnalysisStatus;
  reportId: string;
  vectorStoreId: string;
  updatedAt: number;
  error?: string;
};

type StartAnalysisParams = {
  userId: string;
  threadId: string;
  vectorStoreId: string;
  context: AnalyzeRequest["context"];
  images: AnalysisImage[];
  readyFileNames?: string[];
};

const JOB_TTL_MS = 30 * 60 * 1000;
const userJobs = new Map<string, Map<string, AnalysisJob>>();

function getUserJobs(userId: string) {
  const existing = userJobs.get(userId);
  if (existing) return existing;
  const next = new Map<string, AnalysisJob>();
  userJobs.set(userId, next);
  return next;
}

function scheduleCleanup(userId: string, threadId: string) {
  setTimeout(() => {
    const jobs = userJobs.get(userId);
    if (!jobs) return;
    jobs.delete(threadId);
  }, JOB_TTL_MS);
}

function buildUserPrompt(context: AnalyzeRequest["context"]): string {
  const contextParts: string[] = [];

  if (context.productName) contextParts.push(`Product: ${context.productName}`);
  if (context.productCategory) contextParts.push(`Category: ${context.productCategory}`);
  if (context.abv) contextParts.push(`ABV: ${context.abv}`);
  if (context.containerSize) contextParts.push(`Size: ${context.containerSize}`);
  if (context.producer) contextParts.push(`Producer: ${context.producer}`);
  if (context.additionalNotes) contextParts.push(`Notes: ${context.additionalNotes}`);

  return `Analyze the attached label image(s) for TTB compliance (DISTILLED SPIRITS labeling focus).

Product info: ${contextParts.length > 0 ? contextParts.join(", ") : "See label"}

Look at the label image and check against TTB distilled spirits labeling requirements. Return up to 10 findings.
For each finding, cite the specific CFR section when applicable (e.g., "27 CFR 5.xx") and name the source file you relied on.
No duplicates - one finding per unique issue.`;
}

async function runAnalysisJob(job: AnalysisJob, params: StartAnalysisParams) {
  try {
    const client = getOpenAIClient();

    const regulationsStoreId = getRegulationsVectorStoreId();
    const vectorStoreIds: string[] = [];
    if (regulationsStoreId) {
      vectorStoreIds.push(regulationsStoreId);
    }
    vectorStoreIds.push(params.vectorStoreId);

    const structuredContent = await runComplianceAnalysis(
      client,
      vectorStoreIds,
      buildUserPrompt(params.context),
      params.images,
      COMPLIANCE_REPORT_JSON_SCHEMA as Record<string, unknown>
    );

    const structuredFindings = JSON.parse(structuredContent);

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

    const imageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    const labelFiles: string[] = [];
    const docFiles: string[] = [];

    for (const name of params.readyFileNames || []) {
      const isImage = imageExtensions.some((ext) => name.toLowerCase().endsWith(ext));
      if (isImage) {
        labelFiles.push(name);
      } else {
        docFiles.push(name);
      }
    }

    const report: ComplianceReport = {
      run_id: job.reportId,
      created_at: new Date(job.createdAt).toISOString(),
      inputs: {
        label_files: labelFiles,
        document_files: docFiles,
        context_summary:
          [
            params.context.productName,
            params.context.productCategory,
            params.context.abv,
            params.context.containerSize,
            params.context.producer,
          ]
            .filter(Boolean)
            .join(" | ") || undefined,
      },
      summary,
      findings: structuredFindings.findings || [],
      limitations: structuredFindings.limitations || [],
    };

    job.report = ComplianceReportSchema.parse(report);
    job.status = "done";
    job.updatedAt = Date.now();
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : "Analysis failed";
    job.updatedAt = Date.now();
  } finally {
    scheduleCleanup(job.userId, job.threadId);
  }
}

export function getAnalysisJob(userId: string, threadId: string): AnalysisJobSummary & {
  report?: ComplianceReport;
} | null {
  const jobs = getUserJobs(userId);
  const job = jobs.get(threadId);
  if (!job) return null;
  return {
    id: job.id,
    threadId: job.threadId,
    status: job.status,
    reportId: job.reportId,
    vectorStoreId: job.vectorStoreId,
    updatedAt: job.updatedAt,
    error: job.error,
    report: job.report,
  };
}

export function listActiveAnalysisJobs(userId: string): AnalysisJobSummary[] {
  const jobs = getUserJobs(userId);
  return Array.from(jobs.values())
    .filter((job) => job.status === "running")
    .map((job) => ({
      id: job.id,
      threadId: job.threadId,
      status: job.status,
      reportId: job.reportId,
      vectorStoreId: job.vectorStoreId,
      updatedAt: job.updatedAt,
      error: job.error,
    }));
}

export function startAnalysisJob(params: StartAnalysisParams): AnalysisJobSummary {
  const jobs = getUserJobs(params.userId);
  const existing = jobs.get(params.threadId);
  if (existing && existing.status === "running") {
    return {
      id: existing.id,
      threadId: existing.threadId,
      status: existing.status,
      reportId: existing.reportId,
      vectorStoreId: existing.vectorStoreId,
      updatedAt: existing.updatedAt,
    };
  }

  const job: AnalysisJob = {
    id: randomUUID(),
    threadId: params.threadId,
    userId: params.userId,
    vectorStoreId: params.vectorStoreId,
    status: "running",
    reportId: randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  jobs.set(params.threadId, job);
  void runAnalysisJob(job, params);

  return {
    id: job.id,
    threadId: job.threadId,
    status: job.status,
    reportId: job.reportId,
    vectorStoreId: job.vectorStoreId,
    updatedAt: job.updatedAt,
  };
}
