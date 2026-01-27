"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Finding } from "@/lib/schema";
import { SEVERITY_COLORS } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface FindingCardProps {
  finding: Finding;
  onAskAboutFinding?: (findingId: string) => void;
}

export function FindingCard({ finding, onAskAboutFinding }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = SEVERITY_COLORS[finding.severity];
  const MotionCard = motion(Card);

  // Handle "Ask about this" click
  const handleAskAbout = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAskAboutFinding) {
      onAskAboutFinding(finding.id);
    }
  };

  return (
    <MotionCard
      id={`finding-${finding.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`border rounded-xl overflow-hidden ${colors.border} bg-white shadow-sm ${
        expanded ? "ring-1 ring-blue-200" : "hover:shadow-md"
      }`}
    >
      {/* Header - always visible */}
      <CardHeader
        className="p-4 cursor-pointer hover:bg-gray-50/80 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-gray-900">
                    {finding.title}
                  </h4>
                  <Badge className={`border-transparent ${colors.bg} ${colors.text}`}>
                    {finding.severity}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="font-mono">{finding.id}</span>
                  <span className="h-1 w-1 rounded-full bg-gray-300" />
                  <Badge variant="outline" className="font-mono text-gray-600">
                    {finding.regulation}
                  </Badge>
                </div>
              </div>
              {onAskAboutFinding && (
                <button
                  onClick={handleAskAbout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200/80 transition-colors shrink-0 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  Ask AI
                </button>
              )}
            </div>

            {/* Issue summary */}
            <p
              className={`mt-2 text-sm text-gray-600 leading-relaxed ${
                expanded ? "" : "overflow-hidden"
              }`}
              style={
                expanded
                  ? undefined
                  : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }
              }
            >
              {finding.issue}
            </p>
          </div>

          {/* Expand icon */}
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform shrink-0 ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </CardHeader>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-200">
          <CardContent className="p-0">
            <div className="space-y-3">
              <div>
                <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Requirement
                </h5>
                <p className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg border border-blue-200">
                  {finding.requirement}
                </p>
              </div>

              <div>
                <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Fix
                </h5>
                <p className="text-sm text-blue-800 bg-blue-100/60 p-3 rounded-lg border border-blue-200">
                  {finding.fix}
                </p>
              </div>
            </div>
          </CardContent>
        </div>
      )}
    </MotionCard>
  );
}
