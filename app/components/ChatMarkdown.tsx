"use client";

import React, { memo, useMemo, useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Type for findings
interface Finding {
  id: string;
  title: string;
  [key: string]: unknown;
}

// Copy button component for code blocks
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
      aria-label="Copy code"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// Code block component with copy functionality
function CodeBlock({ children, className, ...props }: any) {
  const codeRef = useRef<HTMLElement>(null);
  const textContent = Array.isArray(children)
    ? children.join("")
    : String(children ?? "");

  return (
    <div className="relative group my-3">
      <CopyButton text={textContent.replace(/\n$/, "")} />
      <pre
        className="rounded-lg bg-gray-900 p-4 overflow-x-auto border border-gray-700"
        {...props}
      >
        <code
          ref={codeRef}
          className="text-sm font-mono text-gray-100"
        >
          {children}
        </code>
      </pre>
    </div>
  );
}

// Inline code component
function InlineCode({ children, ...props }: any) {
  return (
    <code
      className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[0.9em] text-gray-800"
      {...props}
    >
      {children}
    </code>
  );
}

// Code component that switches between block and inline
function MarkdownCode({ inline, className, children, ...props }: any) {
  const textContent = Array.isArray(children)
    ? children.join("")
    : String(children ?? "");
  const isSingleLine = !textContent.includes("\n");
  const isShort = textContent.trim().length <= 80;

  if (inline || (isSingleLine && isShort)) {
    return <InlineCode {...props}>{textContent}</InlineCode>;
  }

  return <CodeBlock className={className} {...props}>{children}</CodeBlock>;
}

// Table component with horizontal scroll
function MarkdownTable({ children, ...props }: any) {
  return (
    <div className="my-4 overflow-x-auto">
      <table
        className="min-w-full border-collapse text-sm"
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

interface ChatMarkdownProps {
  content: string;
  className?: string;
  onFindingClick?: (findingId: string) => void;
  findings?: Finding[];
}

const ChatMarkdown = memo(({ content, className = "", onFindingClick, findings = [] }: ChatMarkdownProps) => {
  // Clean content
  const processedContent = useMemo(() => {
    if (!content || typeof content !== "string") return content;
    return content.trim();
  }, [content]);

  // Process text to replace finding IDs with clickable elements
  const processTextWithFindings = useCallback((text: string): React.ReactNode => {
    if (!text || typeof text !== "string") return text;
    
    const findingIdPattern = /\b(F-\d{3})\b/g;
    const parts = text.split(findingIdPattern);
    
    if (parts.length === 1) return text;
    
    return parts.map((part, index) => {
      // Odd indices are the captured finding IDs
      if (index % 2 === 1) {
        const finding = findings.find((f) => f.id === part);
        if (finding && onFindingClick) {
          return (
            <button
              key={`finding-${index}-${part}`}
              onClick={() => onFindingClick(part)}
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-mono font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors border border-blue-200"
            >
              {part}
            </button>
          );
        }
        // Finding not found or no click handler - just style it
        return (
          <span key={`finding-${index}-${part}`} className="font-mono font-semibold text-blue-700">
            {part}
          </span>
        );
      }
      return part;
    });
  }, [findings, onFindingClick]);

  // Recursively process children to handle finding IDs in text
  const processChildren = useCallback((children: React.ReactNode): React.ReactNode => {
    if (typeof children === "string") {
      return processTextWithFindings(children);
    }
    if (Array.isArray(children)) {
      return children.map((child, i) => {
        if (typeof child === "string") {
          return <React.Fragment key={i}>{processTextWithFindings(child)}</React.Fragment>;
        }
        return child;
      });
    }
    return children;
  }, [processTextWithFindings]);

  // Custom components for ReactMarkdown
  const components = useMemo(() => ({
    code: MarkdownCode,

    p: ({ children, ...props }: any) => (
      <p className="my-2 first:mt-0 last:mb-0 leading-relaxed" {...props}>
        {processChildren(children)}
      </p>
    ),

    li: ({ children, ...props }: any) => (
      <li
        className="[&>p]:my-0 [&_ul]:mt-1.5 [&_ul]:mb-0 [&_ol]:mt-1.5 [&_ol]:mb-0"
        {...props}
      >
        {processChildren(children)}
      </li>
    ),

    // Headings
    h1: ({ children, ...props }: any) => (
      <h1
        className="mt-4 mb-2 text-xl font-bold tracking-tight first:mt-0"
        {...props}
      >
        {processChildren(children)}
      </h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2
        className="mt-3 mb-2 text-lg font-semibold tracking-tight first:mt-0"
        {...props}
      >
        {processChildren(children)}
      </h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3
        className="mt-2.5 mb-1.5 text-base font-semibold tracking-tight first:mt-0"
        {...props}
      >
        {processChildren(children)}
      </h3>
    ),
    h4: ({ children, ...props }: any) => (
      <h4
        className="mt-2 mb-1.5 text-sm font-semibold tracking-tight first:mt-0"
        {...props}
      >
        {processChildren(children)}
      </h4>
    ),

    // Lists
    ul: ({ children, ...props }: any) => (
      <ul className="my-2.5 ml-5 list-outside list-disc space-y-1.5" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol className="my-2.5 ml-5 list-outside list-decimal space-y-1.5" {...props}>
        {children}
      </ol>
    ),

    // Blockquote
    blockquote: ({ children, ...props }: any) => (
      <blockquote
        className="my-3 border-l-4 border-gray-300 pl-4 italic text-gray-600"
        {...props}
      >
        {processChildren(children)}
      </blockquote>
    ),

    // Table elements
    table: MarkdownTable,
    th: ({ children, ...props }: any) => (
      <th
        className="border border-gray-300 bg-gray-100 px-3 py-2 text-left font-semibold"
        {...props}
      >
        {processChildren(children)}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td
        className="border border-gray-300 px-3 py-2 text-left"
        {...props}
      >
        {processChildren(children)}
      </td>
    ),

    // Links
    a: ({ children, href, ...props }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline font-medium"
        {...props}
      >
        {processChildren(children)}
      </a>
    ),

    // Text formatting
    strong: ({ children, ...props }: any) => (
      <strong className="font-semibold" {...props}>
        {processChildren(children)}
      </strong>
    ),
    em: ({ children, ...props }: any) => (
      <em className="italic" {...props}>
        {processChildren(children)}
      </em>
    ),

    // Horizontal rule
    hr: ({ ...props }: any) => (
      <hr className="my-4 border-gray-300" {...props} />
    ),
  }), [processChildren]);

  return (
    <div className={`chat-markdown text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});

ChatMarkdown.displayName = "ChatMarkdown";

export default ChatMarkdown;
