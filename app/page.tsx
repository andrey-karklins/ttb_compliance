"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatPanel } from "./components/ChatPanel";
import { DashboardSection } from "./components/DashboardSection";
import { ComplianceSection } from "./components/ComplianceSection";
import { useAppState } from "./hooks/useAppState";
import { useComplianceState } from "./hooks/useComplianceState";
import type { NavItem } from "@/lib/mockData";
import {
  DEFAULT_CHAT_TITLE,
  DashboardIcon,
  ProductsIcon,
  CopilotIcon,
  FileIcon,
  KnowledgeIcon,
  SearchIcon,
  ChevronRightIcon,
  ClockIcon,
  formatShortDate,
} from "@/lib/mockData";

export default function Home() {
  const app = useAppState();
  const compliance = useComplianceState(app.sessionId);

  // Loading state
  if (!app.sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  const navItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <DashboardIcon className="w-5 h-5" /> },
    { id: "products", label: "Products", icon: <ProductsIcon className="w-5 h-5" /> },
    { id: "pilot", label: "AI Assistant", icon: <CopilotIcon className="w-5 h-5" /> },
    { id: "compliance", label: "AI Compliance", icon: <FileIcon className="w-5 h-5" /> },
    { id: "knowledgebase", label: "TTB Knowledgebase", icon: <KnowledgeIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-sidebar flex flex-col shrink-0">
        <div className="h-16 flex items-center gap-3 px-4 border-b">
          <img
            src="/gs_large_logo.png"
            alt="Global Spirits"
            className="h-9 w-auto object-contain"
          />
          <div>
            <h1 className="text-sm font-semibold text-sidebar-foreground">TTB Compliance</h1>
            <p className="text-[11px] text-muted-foreground">Import Portal</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => app.setActiveNav(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                app.activeNav === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar size="sm">
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">John Doe</p>
              <p className="text-xs text-muted-foreground truncate">Compliance Manager</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b bg-background flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <Select defaultValue="global">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global Spirits</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search..." className="pl-9 w-64" />
            </div>
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {/* DASHBOARD */}
          {app.activeNav === "dashboard" && (
            <DashboardSection kpiData={compliance.kpiData} />
          )}

          {/* PRODUCTS */}
          {app.activeNav === "products" && (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Products</h2>
                  <p className="text-muted-foreground">Manage your product compliance pipeline</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    className="pl-9"
                    value={compliance.productSearchQuery}
                    onChange={(e) => compliance.setProductSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={compliance.productStatusFilter} onValueChange={compliance.setProductStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Stage</TableHead>
                      <TableHead>Days in Stage</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compliance.filteredProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>
                          <Badge variant={
                            product.status === "approved" ? "default" :
                            product.status === "in_review" ? "secondary" :
                            product.status === "blocked" ? "destructive" : "outline"
                          } className={
                            product.status === "approved" ? "bg-emerald-500 hover:bg-emerald-600" : ""
                          }>
                            {product.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{product.stage}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ClockIcon className="w-4 h-4 text-muted-foreground" />
                            {product.daysInStage}d
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm">
                              <AvatarFallback className="text-[10px]">{product.ownerInitials}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{product.owner}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{product.lastUpdated}</TableCell>
                        <TableCell>
                          <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* AI PILOT */}
          {app.activeNav === "pilot" && (
            <div className="p-6 h-[calc(100vh-4rem)]">
              <div className="h-full flex gap-6">
                <div className="w-80 shrink-0">
                  <Card className="h-full flex flex-col overflow-hidden">
                    <CardHeader className="pb-3 shrink-0">
                      <CardTitle className="text-base">Chats</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col p-3 pt-0 min-h-0">
                      <button
                        onClick={app.handleNewChat}
                        className="px-3 py-2 text-xs font-medium rounded-lg border border-primary/20 text-primary hover:bg-primary/5 transition-colors"
                      >
                        New chat
                      </button>
                      <ScrollArea className="flex-1 min-h-0 mt-3">
                        {app.sortedChatThreads.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-2">No chats yet.</p>
                        ) : (
                          <div className="space-y-1 pr-2 w-full max-w-full">
                            {app.sortedChatThreads.map((thread) => {
                              const isActive = thread.id === app.activeChatId;
                              return (
                                <div key={thread.id} className="flex items-start gap-2 min-w-0 w-full max-w-full">
                                  <button
                                    onClick={() => app.handleSelectChat(thread.id)}
                                    className={cn(
                                      "flex-1 min-w-0 text-left px-3 py-2 rounded-lg border transition-colors overflow-hidden",
                                      isActive
                                        ? "border-primary/30 bg-primary/5"
                                        : "border-transparent hover:bg-muted"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                      <div className="text-sm font-medium truncate min-w-0" title={thread.title || DEFAULT_CHAT_TITLE}>
                                        {thread.title || DEFAULT_CHAT_TITLE}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0 max-w-full overflow-hidden">
                                      <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-primary" />
                                      <span className="truncate min-w-0 max-w-full">Chat</span>
                                      {thread.updatedAt && (
                                        <span className="text-muted-foreground/60 shrink-0">
                                          · {formatShortDate(thread.updatedAt)}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => app.handleDeleteChat(thread.id)}
                                    className="mt-2 p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-background transition-colors shrink-0"
                                    aria-label="Delete chat"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex-1 min-w-0">
                  <Card className="h-full flex flex-col overflow-hidden">
                    <ChatPanel
                      chatId={app.activeChatId || app.pendingChatId}
                      vectorStoreId=""
                      report={null}
                      isReportLoading={false}
                      onChatActivity={app.handleChatActivity}
                      title="AI Assistant"
                      subtitle="Ask general TTB labeling questions."
                    />
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* AI COMPLIANCE */}
          {app.activeNav === "compliance" && (
            <ComplianceSection
              sortedReportThreads={compliance.sortedReportThreads}
              activeReportThreadId={compliance.activeReportThreadId}
              analysisJobs={compliance.analysisJobs}
              activeReport={compliance.activeReport}
              reportLoading={compliance.reportLoading}
              reportError={compliance.reportError}
              reportVectorStoreId={compliance.reportVectorStoreId}
              reportChatTitle={compliance.reportChatTitle}
              focusFindingId={compliance.focusFindingId}
              files={compliance.files}
              context={compliance.context}
              fileInputRef={compliance.fileInputRef}
              hasReadyFiles={compliance.hasReadyFiles}
              hasUploadingFiles={compliance.hasUploadingFiles}
              hasImages={compliance.hasImages}
              isAnalyzing={compliance.isAnalyzing}
              onSelectReportThread={(threadId) => {
                compliance.handleSelectReportThread(threadId);
                app.setActiveNav("compliance");
              }}
              onDeleteReportThread={compliance.handleDeleteReportThread}
              onStartUpload={compliance.handleStartUpload}
              onFileSelect={compliance.handleFileSelect}
              onRemoveFile={compliance.removeFile}
              onContextChange={compliance.setContext}
              onAnalyze={() => {
                void (async () => {
                  const newThreadId = await compliance.handleAnalyze();
                  if (newThreadId) {
                    app.setActiveNav("compliance");
                  }
                })();
              }}
              onAskAboutFinding={compliance.handleAskAboutFinding}
              onJumpToFinding={compliance.handleJumpToFinding}
              onClearFocus={compliance.handleClearFocus}
              onReportChatActivity={compliance.handleReportChatActivity}
              onSetActiveNav={app.setActiveNav}
            />
          )}

          {/* TTB KNOWLEDGEBASE */}
          {app.activeNav === "knowledgebase" && (
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">TTB Knowledgebase</h2>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileIcon className="w-3.5 h-3.5" />
                    {compliance.knowledgebaseStats.total} docs
                  </span>
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-3.5 h-3.5" />
                    Latest update {compliance.knowledgebaseStats.latest}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    className="pl-9"
                    value={compliance.docSearchQuery}
                    onChange={(e) => compliance.setDocSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={compliance.docCategoryFilter} onValueChange={compliance.setDocCategoryFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Regulations">Regulations</SelectItem>
                    <SelectItem value="Guidance">Guidance</SelectItem>
                    <SelectItem value="Permits">Permits</SelectItem>
                    <SelectItem value="FAQ">FAQ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {compliance.filteredDocs.map((doc) => (
                  <Card
                    key={doc.id}
                    className="hover:shadow-md transition-shadow cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40"
                    role="link"
                    tabIndex={0}
                    onClick={() => compliance.handleOpenDocUrl(doc.url)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        compliance.handleOpenDocUrl(doc.url);
                      }
                    }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          doc.type === "pdf" ? "bg-red-100" : "bg-blue-100"
                        )}>
                          <FileIcon className={cn(
                            "w-5 h-5",
                            doc.type === "pdf" ? "text-red-600" : "text-blue-600"
                          )} />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <CardTitle className="text-sm truncate">{doc.name}</CardTitle>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">
                              {doc.category}
                            </Badge>
                            <span className="truncate">{doc.fileName}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Updated {doc.lastUpdated}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            compliance.handleOpenDocUrl(doc.url);
                          }}
                        >
                          Open online
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
