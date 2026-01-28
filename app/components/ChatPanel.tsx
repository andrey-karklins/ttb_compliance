"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import type { ComplianceReport, ChatImage } from "@/lib/schema";
import { QUICK_PROMPTS } from "@/lib/schema";
import {
  clearChatMemory,
  getChatSnapshot,
  startChatStream,
  subscribeToChat,
  type ChatSnapshot,
} from "../../lib/chatStore";
import ChatMarkdown from "./ChatMarkdown";

interface ChatPanelProps {
  chatId: string;
  sessionId: string;
  vectorStoreId: string;
  report: ComplianceReport | null;
  images?: ChatImage[]; // Label images for context
  isReportLoading?: boolean;
  onJumpToFinding?: (findingId: string) => void;
  focusFindingId?: string;
  onClearFocus?: () => void;
  onChatActivity?: (chatId: string, content: string) => void;
}

export function ChatPanel({
  chatId,
  sessionId,
  vectorStoreId,
  report,
  images,
  isReportLoading,
  onJumpToFinding,
  focusFindingId,
  onClearFocus,
  onChatActivity,
}: ChatPanelProps) {
  const hasReport = Boolean(report);
  const [chatState, setChatState] = useState<ChatSnapshot>(() => getChatSnapshot(chatId));
  const { messages, isStreaming, hasStartedResponse, error } = chatState;
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const showThinking = isStreaming && !hasStartedResponse;
  const isChatLocked = Boolean(isReportLoading);
  const inputPlaceholder = isChatLocked
    ? "Report is preparing. Chat will unlock when ready."
    : hasReport
      ? "Ask about your compliance findings..."
      : "Ask about TTB labeling rules...";
  const statusInfo = isReportLoading
    ? { label: "Report loading", dotClass: "bg-blue-500", textClass: "text-blue-700" }
    : isStreaming
      ? { label: "Chat active", dotClass: "bg-violet-500", textClass: "text-violet-700" }
      : null;
  const quickPrompts = hasReport
    ? QUICK_PROMPTS
    : [
        "What label statements are required for spirits?",
        "How should the Government Warning be formatted?",
        "What are the ABV and net contents rules?",
        "What claims are commonly prohibited on labels?",
      ];

  // Subscribe to chat state changes
  useEffect(() => {
    setChatState(getChatSnapshot(chatId));
    setInputValue("");
    return subscribeToChat(chatId, setChatState);
  }, [chatId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Prefill input when focus finding changes
  useEffect(() => {
    if (focusFindingId && report) {
      const finding = report.findings.find((f) => f.id === focusFindingId);
      if (finding) {
        setInputValue(`Explain finding ${focusFindingId}: "${finding.title}". Why is this a ${finding.severity}? What exact text changes do I need to make?`);
        inputRef.current?.focus();
      }
    }
  }, [focusFindingId, report]);

  // Send message
  const sendMessage = useCallback(
    async (content: string, findingId?: string) => {
      if (!content.trim() || isStreaming || isChatLocked) return;

      setInputValue("");
      onChatActivity?.(chatId, content.trim());

      // Clear focus after sending
      if (findingId && onClearFocus) {
        onClearFocus();
      }

      await startChatStream({
        chatId,
        sessionId,
        vectorStoreId,
        report,
        content,
        focusFindingId: findingId,
        images,
      });
    },
    [isStreaming, isChatLocked, sessionId, vectorStoreId, report, onClearFocus, images, chatId, onChatActivity]
  );

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue, focusFindingId);
  };

  // Handle quick prompt click
  const handleQuickPrompt = (prompt: string) => {
    if (isChatLocked) return;
    sendMessage(prompt);
  };

  // Render assistant content with markdown and clickable finding IDs
  const renderAssistantContent = (content: string) => {
    return (
      <ChatMarkdown
        content={content}
        onFindingClick={onJumpToFinding}
        findings={report?.findings ?? []}
      />
    );
  };

  // Clear chat history
  const clearChat = () => {
    const shouldClear = window.confirm("Clear this chat? This will remove the current conversation.");
    if (!shouldClear) return;
    clearChatMemory(chatId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-linear-to-r from-white via-violet-50/60 to-white">
        <div>
          <h3 className="font-semibold text-gray-900 text-base">
            AI Compliance Assistant
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Ask questions about regulations or your compliance report
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusInfo && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-gray-200 bg-white/80">
              <span
                className={`h-2 w-2 rounded-full animate-pulse ${statusInfo.dotClass}`}
              />
              <span className={`text-xs font-medium ${statusInfo.textClass}`}>
                {statusInfo.label}
              </span>
            </div>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-xs px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Clear chat
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          {messages.length === 0 ? (
            isReportLoading ? (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 shadow-sm">
                  <svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  Preparing your compliance report
                </h4>
                <p className="text-sm text-gray-600 max-w-md leading-relaxed">
                  We are analyzing the label and compiling findings. Chat will unlock when the report is ready.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-8 px-4">
                <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-violet-100 to-violet-50 flex items-center justify-center mb-5 shadow-sm">
                  <svg
                    className="w-8 h-8 text-violet-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                </div>
                <h4 className="text-xl font-semibold text-gray-900 mb-2">
                  Start a conversation
                </h4>
                <p className="text-sm text-gray-600 mb-8 max-w-md leading-relaxed">
                  {hasReport
                    ? "Ask questions about findings, get detailed explanations of regulations, or learn how to fix compliance issues."
                    : "Ask general TTB labeling questions now, or upload labels to discuss specific findings once analysis is complete."}
                </p>

                {/* Quick prompts */}
                <div className="space-y-2.5 w-full max-w-md">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Suggested prompts
                  </p>
                  {quickPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickPrompt(prompt)}
                      className="w-full text-left px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl hover:bg-violet-50 hover:border-violet-300 hover:shadow-sm transition-all group cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                          <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-violet-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </span>
                        <span className="text-gray-700">{prompt}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            <>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-xl ${
                      message.role === "user"
                        ? "max-w-[85%] bg-violet-600 text-white px-4 py-3"
                        : "w-full bg-gray-50 text-gray-900 px-5 py-4 border border-gray-200"
                    }`}
                  >
                    {message.focusFindingId && message.role === "user" && (
                      <div className="text-xs opacity-80 mb-2 flex items-center gap-1.5 font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        About {message.focusFindingId}
                      </div>
                    )}
                    {message.role === "assistant" ? (
                      <div className="prose-chat">
                        {renderAssistantContent(message.content)}
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </div>
                    )}
                    <div
                      className={`text-xs mt-3 ${
                        message.role === "user"
                        ? "opacity-70"
                        : "text-gray-400 border-t border-gray-200 pt-2"
                      }`}
                    >
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </motion.div>
              ))}
              {showThinking && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex justify-start"
                >
                  <div className="w-full bg-gray-50 rounded-xl px-5 py-4 border border-gray-200">
                    <div className="flex items-center gap-3 text-gray-600">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      </div>
                      <span className="text-sm font-medium">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Focus finding indicator */}
      {focusFindingId && (
        <div className="px-4 py-2 bg-violet-50 border-t border-violet-200 flex items-center justify-between">
          <span className="text-sm text-violet-700">
            Asking about <span className="font-mono font-semibold">{focusFindingId}</span>
          </span>
          {onClearFocus && (
            <button
              onClick={onClearFocus}
              className="text-xs text-violet-600 hover:underline"
            >
              Clear focus
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-gray-50/50">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={inputPlaceholder}
            rows={3}
            className="flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100"
            disabled={isStreaming || isChatLocked}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isStreaming || isChatLocked}
            className={`self-end px-4 py-3 rounded-xl font-medium transition-all shadow-sm ${
              !inputValue.trim() || isStreaming || isChatLocked
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-violet-600 text-white hover:bg-violet-700 hover:shadow-md active:scale-95"
            }`}
          >
            {isStreaming ? (
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 ml-1">
          {isChatLocked
            ? "Report is preparing. Chat will unlock when ready."
            : "Enter to send · Shift+Enter for new line"}
        </p>
      </form>
    </div>
  );
}
