# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TTB Compliance Portal - A Next.js application for analyzing distilled spirits labels against TTB (Alcohol and Tobacco Tax and Trade Bureau) regulations. The app uses OpenAI's API with retrieval-augmented generation (RAG) to identify compliance issues in label images and provide regulatory guidance.

## Development Commands

```bash
# Development server (runs on http://localhost:3000)
npm run dev

# Production build
npm run build

# Production server (requires build first)
npm start

# Linting
npm run lint
```

## Environment Setup

Required `.env` file in root:
```
OPENAI_API_KEY=your_api_key_here
```

## Architecture

### Session & State Management

The app uses a **dual-state architecture** with separate client and server state stores:

1. **Client State** (`lib/chatStore.ts`, `lib/chat/chatEngine.ts`):
   - Persists chat messages and stream state to localStorage
   - Multi-user support via `ttb_uid` cookie
   - Stream resumption on page reload via stored stream cursor positions
   - In-memory `ChatMemory` objects cache active chat state
   - `ensureChatMemory()` hydrates from localStorage on first access

2. **Server State** (`lib/chatServerStore.ts`, `lib/analysisServerStore.ts`):
   - In-memory stores (resets on server restart)
   - `chatServerStore`: manages active SSE streams and OpenAI assistant threads
   - `analysisServerStore`: manages background compliance analysis jobs
   - Session isolation by userId

3. **Hooks** (`app/hooks/useAppState.ts`, `app/hooks/useComplianceState.ts`):
   - `useAppState`: general app navigation and chat thread management
   - `useComplianceState`: compliance-specific state (reports, uploads, analysis jobs)

### Chat System

**Stream Architecture** (SSE-based):
- Client initiates chat via `POST /api/chat` → server creates OpenAI assistant thread
- Server returns SSE stream with events: `meta`, `delta`, `done`, `error`
- Client maintains stream cursor position and can resume interrupted streams
- Stream state persisted to localStorage with `{id, assistantId, cursor, status}`
- On reload: client calls `resumeChatStream()` → `GET /api/chat?streamId=X&cursor=Y`

**Two Chat Modes**:
1. **General Assistant** (`/api/chat` with `vectorStoreId=""`, `report=null`):
   - Answers general TTB labeling questions
   - Uses the regulations vector store from `/api/init-regulations`

2. **Report Assistant** (`/api/chat` with specific `vectorStoreId` and `report`):
   - Context-aware analysis of specific compliance reports
   - Can reference specific findings via `focusFindingId`
   - Includes label images in context

**Key Files**:
- `app/api/chat/route.ts`: SSE endpoint (GET for resume, POST for new, DELETE for clear)
- `lib/chatServerStore.ts`: manages OpenAI threads and stream state on server
- `lib/chatStore.ts`: client-side API wrapper
- `lib/chat/chatEngine.ts`: localStorage persistence, SSE parsing, subscription system

### Compliance Analysis Flow

1. **Upload Phase** (`/api/uploads`):
   - User uploads label images (PNG/JPG) and/or supporting documents (PDF)
   - Images: converted to base64 and stored in memory for analysis
   - PDFs: uploaded to user-specific OpenAI vector store
   - Returns `vectorStoreId` for RAG queries

2. **Analysis Phase** (`/api/analyze`):
   - Combines label images, context form data, and vector store
   - Creates OpenAI assistant with structured output (JSON schema)
   - Runs in background (202 response, poll via GET)
   - System prompt: `lib/prompts.ts` → `DISTILLED_SPIRITS_ANALYZE_INSTRUCTIONS`
   - Output: `ComplianceReport` with findings array

3. **Report Viewing** (`ComplianceSection.tsx`):
   - Displays findings sorted by severity (blocker > major > minor > info)
   - "Ask about finding" creates focused chat with `focusFindingId`
   - Report JSON stored in analysis job state and passed to chat context

**Key Files**:
- `app/api/analyze/route.ts`: starts analysis jobs (POST) and polls status (GET)
- `lib/analysisServerStore.ts`: manages background jobs using OpenAI assistants
- `lib/schema.ts`: Zod schemas + JSON schema for structured output
- `lib/prompts.ts`: compliance analysis system prompt

### Knowledge Base

The `docs/` directory contains TTB regulatory documents:
- `CFR-2025-title27-vol*.pdf`: Title 27 Code of Federal Regulations
- `labelling_guideline.md`, `*_faq.md`: extracted TTB guidance
- `ttb_labelling_2022.pdf`, `ttb_permit_requirements_2006.pdf`: official PDFs

These documents are indexed into OpenAI vector stores:
- Global regulations store: initialized via `/api/init-regulations` (called on app load)
- User-specific stores: created per upload session for label analysis

### UI Structure

**Navigation** (sidebar in `app/page.tsx`):
- Dashboard: KPI summary cards
- Products: product pipeline table (mock data)
- AI Assistant: general TTB Q&A chat
- AI Compliance: upload → analyze → chat about findings
- TTB Knowledgebase: browsable document cards

**Component Organization**:
- `app/components/`: page sections (DashboardSection, ComplianceSection) and shared UI (ChatPanel, FindingCard, ReportWorkspace, ResultsPanel)
- `components/ui/`: shadcn/ui components (generated, do not manually edit)
- Styling: Tailwind CSS v4 + custom sidebar theming

## Important Patterns

### Path Aliasing
Use `@/` prefix for absolute imports (defined in `tsconfig.json`):
```typescript
import { schema } from "@/lib/schema";
import { Button } from "@/components/ui/button";
```

### OpenAI Integration
- Uses `openai` npm package with assistants API + file search tool
- Structured outputs via `response_format: { type: "json_schema", ... }`
- Vector stores attached to assistants for RAG
- Cleanup: vector stores and threads are NOT deleted (consider cleanup for production)

### Error Handling
- Server errors logged to console and returned as JSON `{ error: "..." }`
- Client errors stored in state (`error: string | null`) and displayed inline
- Stream errors trigger `error` SSE event → client sets `isStreaming=false, error=msg`

### Data Persistence
- **Client**: localStorage (chat history, stream state, session files)
- **Server**: in-memory only (resets on restart)
- **Production consideration**: add database for persistent server state

## Special Notes

### Mock Data
`lib/mockData.tsx` provides placeholder data for dashboard KPIs, products table, and knowledgebase documents. Replace with real data sources as needed.

### Session Management
- Sessions identified by `ttb_uid` cookie (30-day expiry)
- Created on first API request if not present
- Used for multi-user isolation in server stores
- Client syncs sessionId via `/api/session` on mount

### Stream Resumption
The app can resume interrupted SSE streams across page reloads:
1. `persistStreamState()` saves `{streamId, assistantId, cursor}` to localStorage
2. On reload, `ensureChatMemory()` detects active stream
3. `resumeChatStream()` calls `GET /api/chat?streamId=X&cursor=Y`
4. Server streams from saved cursor position (skips already-delivered content)

### Compliance Report Schema
Reports follow a strict structure defined in `lib/schema.ts`:
- Findings: `{id, severity, title, issue, regulation, requirement, fix, source}`
- Severity levels: "blocker", "major", "minor", "info"
- Limitations: `{missing_inputs[], unverified[], scope_notes[]}`
- JSON schema enforced via OpenAI structured outputs

### Regulatory Prompt
The analysis prompt (`DISTILLED_SPIRITS_ANALYZE_INSTRUCTIONS`) is embedded in code to avoid filesystem dependencies. It references documents in `docs/` that are loaded into vector stores. If modifying the prompt, ensure it remains aligned with the JSON schema.
