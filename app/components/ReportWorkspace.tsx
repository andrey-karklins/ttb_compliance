"use client";

import { useState, useRef, useCallback } from "react";
import type { ComplianceReport, ChatImage } from "@/lib/schema";
import { ResultsPanel } from "./ResultsPanel";
import { ChatPanel } from "./ChatPanel";

interface ReportWorkspaceProps {
  report: ComplianceReport | null;
  isLoading: boolean;
  error: string | null;
  sessionId: string;
  vectorStoreId: string;
  images?: ChatImage[]; // Label images for chat context
}

type Tab = "report" | "chat";

export function ReportWorkspace({
  report,
  isLoading,
  error,
  sessionId,
  vectorStoreId,
  images,
}: ReportWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [focusFindingId, setFocusFindingId] = useState<string | undefined>();
  const reportRef = useRef<HTMLDivElement>(null);

  // Handle "Ask about this" from finding cards
  const handleAskAboutFinding = useCallback((findingId: string) => {
    setFocusFindingId(findingId);
    // On mobile, switch to chat tab
    setActiveTab("chat");
  }, []);

  // Handle jumping to a finding from chat
  const handleJumpToFinding = useCallback((findingId: string) => {
    // Switch to report tab on mobile
    setActiveTab("report");
    // Scroll to finding after a brief delay for tab switch
    setTimeout(() => {
      const element = document.getElementById(`finding-${findingId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        // Add a brief highlight effect
        element.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
        setTimeout(() => {
          element.classList.remove("ring-2", "ring-blue-500", "ring-offset-2");
        }, 2000);
      }
    }, 100);
  }, []);

  // Clear focus finding
  const handleClearFocus = useCallback(() => {
    setFocusFindingId(undefined);
  }, []);

  // Loading or error state - show full width
  if (isLoading || error || !report) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <ResultsPanel report={report} isLoading={isLoading} error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile tabs - visible only on small screens */}
      <div className="lg:hidden bg-white rounded-lg border border-gray-200 p-1">
        <div className="flex">
          <button
            onClick={() => setActiveTab("report")}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "report"
              ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Report
            </span>
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "chat"
              ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              Chat
            {focusFindingId && (
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            )}
            </span>
          </button>
        </div>
      </div>

      {/* Desktop two-column layout / Mobile single view */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Report Panel - Left side on desktop */}
        <div
          ref={reportRef}
          className={`lg:flex-1 lg:min-w-0 ${
            activeTab === "report" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <ResultsPanel
              report={report}
              isLoading={isLoading}
              error={error}
              onAskAboutFinding={handleAskAboutFinding}
            />
          </div>
        </div>

        {/* Chat Panel - Right side on desktop, sticky - WIDER */}
        <div
          className={`lg:w-[550px] xl:w-[600px] lg:shrink-0 ${
            activeTab === "chat" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="lg:sticky lg:top-24 bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-8rem)] lg:h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
            <ChatPanel
              chatId={report?.run_id ?? "general"}
              sessionId={sessionId}
              vectorStoreId={vectorStoreId}
              report={report}
              images={images}
              onJumpToFinding={handleJumpToFinding}
              focusFindingId={focusFindingId}
              onClearFocus={handleClearFocus}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
