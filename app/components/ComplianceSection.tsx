"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatPanel } from "./ChatPanel";
import { ResultsPanel } from "./ResultsPanel";
import { FileIcon, formatShortDate, formatFileSize } from "@/lib/mockData";
import type { ComplianceReport, UploadedFile, ContextFormData } from "@/lib/schema";
import type { ReportThread, AnalysisJobState } from "@/lib/mockData";

interface ComplianceSectionProps {
  // Report threads
  sortedReportThreads: ReportThread[];
  activeReportThreadId: string;
  analysisJobs: Record<string, AnalysisJobState>;
  // Active report
  activeReport: ComplianceReport | null;
  reportLoading: boolean;
  reportError: string | null;
  reportVectorStoreId: string;
  reportChatTitle: string;
  // Focus
  focusFindingId: string | undefined;
  // Files
  files: UploadedFile[];
  context: ContextFormData;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  hasReadyFiles: boolean;
  hasUploadingFiles: boolean;
  hasImages: boolean;
  isAnalyzing: boolean;
  // Handlers
  onSelectReportThread: (threadId: string) => void;
  onDeleteReportThread: (threadId: string) => void;
  onStartUpload: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (fileId: string) => void;
  onContextChange: (context: ContextFormData) => void;
  onAnalyze: () => void;
  onAskAboutFinding: (findingId: string) => void;
  onJumpToFinding: (findingId: string) => void;
  onClearFocus: () => void;
  onReportChatActivity: (threadId: string, content: string) => void;
  onSetActiveNav: (nav: string) => void;
}

export function ComplianceSection({
  sortedReportThreads,
  activeReportThreadId,
  analysisJobs,
  activeReport,
  reportLoading,
  reportError,
  reportVectorStoreId,
  reportChatTitle,
  focusFindingId,
  files,
  context,
  fileInputRef,
  hasReadyFiles,
  hasUploadingFiles,
  hasImages,
  isAnalyzing,
  onSelectReportThread,
  onDeleteReportThread,
  onStartUpload,
  onFileSelect,
  onRemoveFile,
  onContextChange,
  onAnalyze,
  onAskAboutFinding,
  onJumpToFinding,
  onClearFocus,
  onReportChatActivity,
  onSetActiveNav,
}: ComplianceSectionProps) {
  return (
    <div className="p-6 h-[calc(100vh-4rem)]">
      <div className="h-full flex gap-6">
        {/* Report thread sidebar */}
        <div className="w-80 shrink-0">
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="text-base">Reports</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-3 pt-0 min-h-0">
              <button
                onClick={() => { onStartUpload(); onSetActiveNav("compliance"); }}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-blue-500/20 text-blue-600 hover:bg-blue-50 transition-colors"
              >
                Analyze Label
              </button>
              <ScrollArea className="flex-1 min-h-0 mt-3">
                {sortedReportThreads.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2">No reports yet.</p>
                ) : (
                  <div className="space-y-1 pr-2">
                    {sortedReportThreads.map((thread) => {
                      const isActive = thread.id === activeReportThreadId;
                      const analysisState = analysisJobs[thread.id];
                      const isThreadAnalyzing = analysisState?.status === "running";
                      const isThreadError = analysisState?.status === "error";
                      const statusLabel = isThreadAnalyzing
                        ? "Analyzing..."
                        : isThreadError
                          ? "Failed"
                          : "Report";
                      const statusDot = isThreadAnalyzing
                        ? "bg-orange-500 animate-pulse"
                        : isThreadError
                          ? "bg-red-500"
                          : "bg-blue-500";
                      return (
                        <div
                          key={thread.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectReportThread(thread.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectReportThread(thread.id);
                            }
                          }}
                          className={cn(
                            "w-full min-w-0 text-left px-3 py-2 rounded-lg border transition-colors overflow-hidden cursor-pointer",
                            isActive
                              ? "border-blue-500/30 bg-blue-50"
                              : "border-transparent hover:bg-muted"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                              {isThreadAnalyzing && (
                                <svg className="animate-spin h-3.5 w-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              )}
                              <div className="text-sm font-medium truncate min-w-0 max-w-full" title={thread.title || "Analyzing label..."}>
                                {thread.title || "Analyzing label..."}
                              </div>
                            </div>
                            {!isThreadAnalyzing && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteReportThread(thread.id);
                                }}
                                className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-background transition-colors shrink-0"
                                aria-label="Delete report"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0 max-w-full overflow-hidden">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot)} />
                            <span className="truncate min-w-0 max-w-full">{statusLabel}</span>
                            {!isThreadAnalyzing && thread.updatedAt && (
                              <span className="text-muted-foreground/60 shrink-0">
                                · {formatShortDate(thread.updatedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {activeReportThreadId ? (
            <div className="h-full flex gap-6">
              <div className="flex-1 min-w-0">
                <Card className="h-full flex flex-col overflow-hidden">
                  <ChatPanel
                    chatId={activeReportThreadId}
                    vectorStoreId={reportVectorStoreId}
                    report={activeReport}
                    isReportLoading={reportLoading}
                    onJumpToFinding={onJumpToFinding}
                    focusFindingId={focusFindingId}
                    onClearFocus={onClearFocus}
                    onChatActivity={onReportChatActivity}
                    title={reportChatTitle}
                    subtitle="Ask questions about your compliance report"
                  />
                </Card>
              </div>
              <div className="flex-1 min-w-0">
                <Card className="h-full overflow-auto">
                  <CardContent className="p-6">
                    <ResultsPanel
                      report={activeReport}
                      isLoading={reportLoading}
                      error={reportError}
                      onAskAboutFinding={onAskAboutFinding}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-start">
              <Card className="w-full max-w-3xl">
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
                      onChange={onFileSelect}
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
                              <button onClick={() => onRemoveFile(file.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
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
                        onChange={(e) => onContextChange({ ...context, additionalNotes: e.target.value })}
                        placeholder="Any specific concerns to check..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border rounded-lg bg-background placeholder-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                      />
                    </div>
                  )}

                  {/* Analyze button */}
                  <div className="flex justify-end">
                    <button
                      onClick={onAnalyze}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
