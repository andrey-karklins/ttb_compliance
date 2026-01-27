"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ComplianceReport, Severity } from "@/lib/schema";
import { SEVERITY_ORDER, SEVERITY_COLORS } from "@/lib/schema";
import { FindingCard } from "./FindingCard";
import { Button } from "@/components/ui/button";

interface ResultsPanelProps {
  report: ComplianceReport | null;
  isLoading: boolean;
  error: string | null;
  onAskAboutFinding?: (findingId: string) => void;
}

export function ResultsPanel({ report, isLoading, error, onAskAboutFinding }: ResultsPanelProps) {
  const [showJson, setShowJson] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

  // Loading state
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-6 w-44 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-20 rounded-xl bg-gray-100 border border-gray-200" />
          ))}
        </div>

        <div className="space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-xl bg-gray-100 border border-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg
            className="h-6 w-6 text-red-600"
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
        </div>
        <p className="text-red-600 text-lg font-medium">Analysis Failed</p>
        <p className="text-gray-600 text-sm mt-2 max-w-md text-center">
          {error}
        </p>
      </div>
    );
  }

  // Empty state
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg
            className="h-8 w-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No Analysis Yet
        </h3>
        <p className="text-gray-600 max-w-sm">
          Upload your label images and supporting documents, then click &quot;Analyze&quot; to check
          for TTB compliance issues.
        </p>
      </div>
    );
  }

  // Filter findings
  const filteredFindings =
    severityFilter === "all"
      ? report.findings
      : report.findings.filter((f) => f.severity === severityFilter);

  // Sort by severity
  const sortedFindings = [...filteredFindings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ttb-compliance-report-${report.run_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Header with summary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Compliance Report
          </h2>
          <p className="text-sm text-gray-500">
            Generated {new Date(report.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide JSON" : "View JSON"}
          </Button>
          <Button size="sm" onClick={downloadReport} className="shadow-sm">
            Download
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(["blocker", "major", "minor", "info"] as const).map((severity) => {
          const colors = SEVERITY_COLORS[severity];
          const count = report.summary[severity];
          return (
            <motion.button
              key={severity}
              onClick={() => setSeverityFilter(severityFilter === severity ? "all" : severity)}
              whileTap={{ scale: 0.98 }}
              className={`p-3 rounded-xl border-2 transition-all shadow-sm cursor-pointer ${
                severityFilter === severity
                  ? `${colors.border} ${colors.bg}`
                  : "border-transparent bg-gray-50"
              }`}
            >
              <div className={`text-2xl font-bold ${colors.text}`}>{count}</div>
              <div className="text-xs uppercase font-medium text-gray-600">
                {severity}
              </div>
            </motion.button>
          );
        })}
        <div className="p-3 rounded-xl bg-gray-100 border border-gray-200 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">
            {report.summary.total}
          </div>
          <div className="text-xs uppercase font-medium text-gray-600">
            Total
          </div>
        </div>
      </div>

      {/* Limitations */}
      {report.limitations.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-800 mb-1">
            Limitations
          </h4>
          <ul className="text-sm text-blue-700 list-disc list-inside">
            {report.limitations.map((lim, idx) => (
              <li key={idx}>{lim}</li>
            ))}
          </ul>
        </div>
      )}

      {/* JSON view */}
      {showJson && (
        <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
          <pre className="text-xs text-blue-300 whitespace-pre-wrap">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}

      {/* Findings list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            Findings ({sortedFindings.length}
            {severityFilter !== "all" && ` ${severityFilter}`})
          </h3>
          {severityFilter !== "all" && (
            <Button
              variant="link"
              size="sm"
              onClick={() => setSeverityFilter("all")}
              className="h-auto p-0 text-blue-600"
            >
              Show all
            </Button>
          )}
        </div>

        {sortedFindings.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            {severityFilter === "all"
              ? "No compliance issues found!"
              : `No ${severityFilter} issues found.`}
          </p>
        ) : (
          <div className="space-y-3">
            {sortedFindings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                onAskAboutFinding={onAskAboutFinding}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
