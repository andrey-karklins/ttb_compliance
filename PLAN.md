# Product Vision Plan — US Import Spirits Compliance Portal

## Goals & Business Objectives
- Provide exec-level visibility into compliance pipeline health, blockers, and time-to-approval.
- Centralize compliance knowledge and decision support for US import of spirits.
- Make current stage + risk obvious across all products and markets.
- Keep the existing AI compliance agent as the one live capability; everything else is mocked.

## Information Architecture & Layout
- **App Shell**
  - Left sidebar navigation: Dashboard, Products, Compliance Stages, AI Copilot, TTB Knowledgebase.
  - Top bar: Company selector, global search, date range, user menu.
  - Main content area with page header + filters.
- **Dashboard (Executive View)**
  - KPI cards: Total products, In review, Blockers, Avg days in stage.
  - Stage distribution chart + trend chart (mocked).
  - “Top blockers” list with severity badges and owners.
  - “Recent activity” feed (mocked).
- **Products**
  - Product list table with filters (status, market, stage).
  - Row actions menu and summary badges.
  - Right-side details panel (mocked) with summary, documents, owners, SLA.
- **Compliance Stages**
  - Tabbed stages (Formula, COLA/Labeling, Import/Customs, State).
  - Progress bars per product + a timeline/kanban style snapshot.
- **AI Compliance Agent**
  - Reuse current chat + report UI for “Copilot” panel.
  - Pre-filled prompts focused on blockers, risk, and next steps.
- **TTB Knowledgebase**
  - Scrollable list of compliance documents (from `/docs`), with category + last updated.
  - Search/filter mock controls.

## Mocking Strategy (Non-AI Sections)
- Use static arrays inside the page component for: product list, compliance stages, blockers, and docs.
- All status values, dates, and owners are prefilled (no backend).
- Keep AI agent + label analysis as the only live feature.

## Reuse of Current Code
- **AI Copilot**
  - `app/components/ChatPanel.tsx` for the main copilot interface.
  - `lib/chatStore.ts` + `app/api/chat/route.ts` for live chat behavior.
- **Compliance Findings**
  - `app/components/ResultsPanel.tsx` and `app/components/FindingCard.tsx` for a mock “finding snapshot.”
  - `app/api/analyze/route.ts` remains intact for real label analysis.

## Shadcn Components & Registry References (Expected After Add-All)
**Core UI components to use (files in `components/ui/`):**
- `tabs.tsx` (section switching for Stages and Product details)
- `table.tsx` (Products list)
- `progress.tsx` (stage completion)
- `dropdown-menu.tsx` (row actions + filters)
- `tooltip.tsx` (status explanations)
- `avatar.tsx` (owners)
- `input.tsx`, `select.tsx` (filters/search)
- `separator.tsx`, `scroll-area.tsx` (layout structure)
- Existing: `button.tsx`, `badge.tsx`, `card.tsx`

**Registry blocks to adapt from @shadcn:**
- `dashboard-01` for the executive dashboard layout.
- `sidebar-16` for a sticky app shell navigation pattern.
- `chart-*` blocks for compliance distribution and trends.

## Implementation Outline (Next Step)
- Replace `app/page.tsx` with the new portal layout using mocked data.
- Embed the existing AI agent panel as the “AI Copilot” section.
- Add dashboard, products, stages, and knowledgebase sections using shadcn components.
