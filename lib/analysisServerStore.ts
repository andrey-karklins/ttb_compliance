import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
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

const JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_DIR = path.join(process.cwd(), ".data");
const STORAGE_FILE = path.join(STORAGE_DIR, "analysis-jobs.json");
const STORAGE_VERSION = 1;
const CFR_CITATION_REGEX = /\b27 CFR\s+\d+\.\d+[a-z0-9]*(?:\([a-z0-9]+\))*\b/i;
const userJobs = new Map<string, Map<string, AnalysisJob>>();
let hasLoadedPersisted = false;

type PersistedDb = {
  version: number;
  users: Record<string, Record<string, AnalysisJob>>;
};

function getUserJobs(userId: string) {
  const existing = userJobs.get(userId);
  if (existing) return existing;
  const next = new Map<string, AnalysisJob>();
  userJobs.set(userId, next);
  return next;
}

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function loadPersistedDb(): PersistedDb {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return { version: STORAGE_VERSION, users: {} };
    }
    const raw = fs.readFileSync(STORAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as PersistedDb;
    if (!parsed || parsed.version !== STORAGE_VERSION || typeof parsed.users !== "object") {
      return { version: STORAGE_VERSION, users: {} };
    }
    return parsed;
  } catch {
    return { version: STORAGE_VERSION, users: {} };
  }
}

function savePersistedDb(db: PersistedDb) {
  try {
    ensureStorageDir();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(db));
  } catch {
    // Persistence is best-effort.
  }
}

function isJobExpired(job: AnalysisJob) {
  return Date.now() - job.updatedAt > JOB_TTL_MS;
}

function upsertJob(job: AnalysisJob) {
  const jobs = getUserJobs(job.userId);
  const existing = jobs.get(job.threadId);
  if (!existing || existing.updatedAt < job.updatedAt) {
    jobs.set(job.threadId, job);
  }
}

function cleanupExpiredJobs() {
  const db = loadPersistedDb();
  let changed = false;

  for (const [userId, threads] of Object.entries(db.users)) {
    for (const [threadId, job] of Object.entries(threads)) {
      if (!job || isJobExpired(job)) {
        delete threads[threadId];
        const userMap = userJobs.get(userId);
        userMap?.delete(threadId);
        changed = true;
      }
    }
    if (Object.keys(threads).length === 0) {
      delete db.users[userId];
      changed = true;
    }
  }

  if (changed) {
    savePersistedDb(db);
  }
}

function loadPersistedJobs() {
  if (hasLoadedPersisted) return;
  hasLoadedPersisted = true;
  cleanupExpiredJobs();

  const db = loadPersistedDb();
  for (const [userId, threads] of Object.entries(db.users)) {
    for (const [threadId, job] of Object.entries(threads)) {
      if (!job || isJobExpired(job)) continue;
      upsertJob({ ...job, userId, threadId });
    }
  }
}

function persistJob(job: AnalysisJob) {
  try {
    const db = loadPersistedDb();
    const bucket = db.users[job.userId] ?? {};
    bucket[job.threadId] = job;
    db.users[job.userId] = bucket;
    savePersistedDb(db);
  } catch {
    // Ignore persistence failures.
  }
}

function removePersistedJob(userId: string, threadId: string) {
  try {
    const db = loadPersistedDb();
    const bucket = db.users[userId];
    if (!bucket || !bucket[threadId]) return;
    delete bucket[threadId];
    if (Object.keys(bucket).length === 0) {
      delete db.users[userId];
    }
    savePersistedDb(db);
  } catch {
    // Ignore persistence failures.
  }
}

function scheduleCleanup(userId: string, threadId: string) {
  void userId;
  void threadId;
  cleanupExpiredJobs();
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
For each finding, cite the specific CFR section (e.g., "27 CFR 5.70(a)") and name the source file you relied on.
No duplicates - one finding per unique issue.`;
}

function extractCfrCitation(...texts: Array<string | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = text.match(CFR_CITATION_REGEX);
    if (match) {
      return match[0].replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

function normalizeRegulation(finding: { regulation?: string; requirement?: string; issue?: string }) {
  const match = extractCfrCitation(finding.regulation, finding.requirement, finding.issue);
  return match ?? (finding.regulation ?? "").trim();
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

    const rawFindings = Array.isArray(structuredFindings.findings)
      ? structuredFindings.findings
      : [];
    const findings = rawFindings.map(
      (finding: { regulation?: string; requirement?: string; issue?: string }) => ({
        ...finding,
        regulation: normalizeRegulation(finding),
      })
    ) as ComplianceReport["findings"];

    const summary: Summary = {
      blocker: 0,
      major: 0,
      minor: 0,
      info: 0,
      total: 0,
    };

    for (const finding of findings) {
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

    const limitations =
      structuredFindings.limitations &&
      typeof structuredFindings.limitations === "object" &&
      !Array.isArray(structuredFindings.limitations)
        ? {
            missing_inputs: structuredFindings.limitations.missing_inputs ?? [],
            unverified: structuredFindings.limitations.unverified ?? [],
            scope_notes: structuredFindings.limitations.scope_notes ?? [],
          }
        : { missing_inputs: [], unverified: [], scope_notes: [] };

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
      findings,
      limitations,
    };

    job.report = ComplianceReportSchema.parse(report);
    job.status = "done";
    job.updatedAt = Date.now();
    persistJob(job);
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : "Analysis failed";
    job.updatedAt = Date.now();
    persistJob(job);
  } finally {
    scheduleCleanup(job.userId, job.threadId);
  }
}

export function getAnalysisJob(userId: string, threadId: string): AnalysisJobSummary & {
  report?: ComplianceReport;
} | null {
  loadPersistedJobs();
  const jobs = getUserJobs(userId);
  const job = jobs.get(threadId);
  if (!job) return null;
  if (isJobExpired(job)) {
    const userMap = userJobs.get(userId);
    userMap?.delete(threadId);
    removePersistedJob(userId, threadId);
    return null;
  }
  const parsedReport = job.report ? ComplianceReportSchema.safeParse(job.report) : null;

  return {
    id: job.id,
    threadId: job.threadId,
    status: job.status,
    reportId: job.reportId,
    vectorStoreId: job.vectorStoreId,
    updatedAt: job.updatedAt,
    error: job.error,
    report: parsedReport?.success ? parsedReport.data : undefined,
  };
}

export function listActiveAnalysisJobs(userId: string): AnalysisJobSummary[] {
  loadPersistedJobs();
  const jobs = getUserJobs(userId);
  const summaries: AnalysisJobSummary[] = [];

  for (const job of jobs.values()) {
    if (isJobExpired(job)) {
      const userMap = userJobs.get(userId);
      userMap?.delete(job.threadId);
      removePersistedJob(userId, job.threadId);
      continue;
    }
    if (job.status === "running") {
      summaries.push({
        id: job.id,
        threadId: job.threadId,
        status: job.status,
        reportId: job.reportId,
        vectorStoreId: job.vectorStoreId,
        updatedAt: job.updatedAt,
        error: job.error,
      });
    }
  }

  return summaries;
}

export function startAnalysisJob(params: StartAnalysisParams): AnalysisJobSummary {
  loadPersistedJobs();
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
  persistJob(job);
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
