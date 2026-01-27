"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { ResultsPanel } from "./components/ResultsPanel";
import { ChatPanel } from "./components/ChatPanel";
import type {
  UploadedFile,
  ContextFormData,
  ComplianceReport,
  AnalyzeRequest,
  UploadResponse,
  AnalysisImage,
  ChatImage,
} from "@/lib/schema";

const SESSION_KEY = "ttb_session_id";
const UPLOAD_CONCURRENCY = 3;

export default function Home() {
  const [sessionId, setSessionId] = useState<string>("");
  const [vectorStoreId, setVectorStoreId] = useState<string | undefined>();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [context, setContext] = useState<ContextFormData>({
    productName: "",
    productCategory: "",
    abv: "",
    containerSize: "",
    producer: "",
    additionalNotes: "",
  });
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [focusFindingId, setFocusFindingId] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(SESSION_KEY, id);
    }
    setSessionId(id);
  }, []);

  const hasReadyFiles = files.some((f) => f.status === "ready");
  const hasUploadingFiles = files.some((f) => f.status === "uploading" || f.status === "processing");
  const hasImages = files.some((f) => f.isImage && f.status === "ready");
  const showUploadPanel = !isAnalyzing && !report && !analysisError;

  // Compute chat images from ready image files
  const chatImages: ChatImage[] = useMemo(() => {
    return files
      .filter((f) => f.isImage && f.status === "ready" && f.imageBase64)
      .map((f) => ({
        base64: f.imageBase64!,
        mimeType: f.mimeType,
        filename: f.name,
      }));
  }, [files]);

  // Auto-fill context from extracted details
  useEffect(() => {
    const imageFile = files.find((f) => f.isImage && f.extractedDetails);
    if (imageFile?.extractedDetails) {
      setContext((prev) => ({
        productName: prev.productName || imageFile.extractedDetails?.productName || "",
        productCategory: prev.productCategory || imageFile.extractedDetails?.productCategory || "",
        abv: prev.abv || imageFile.extractedDetails?.abv || "",
        containerSize: prev.containerSize || imageFile.extractedDetails?.containerSize || "",
        producer: prev.producer || imageFile.extractedDetails?.producer || "",
        additionalNotes: prev.additionalNotes,
      }));
    }
  }, [files]);

  const uploadSingleFile = useCallback(
    async (file: File, fileId: string, currentVectorStoreId: string | undefined) => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", sessionId);
        if (currentVectorStoreId) {
          formData.append("vectorStoreId", currentVectorStoreId);
        }

        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        const result: UploadResponse = await response.json();

        if (!response.ok) {
          throw new Error((result as unknown as { error: string }).error || "Upload failed");
        }

        return { success: true, result, fileId };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Upload failed",
          fileId,
        };
      }
    },
    [sessionId]
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []);
      if (selectedFiles.length === 0) return;

      const newFiles: UploadedFile[] = selectedFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        size: file.size,
        isImage: file.type.startsWith("image/"),
        status: "uploading" as const,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      let currentVectorStoreId = vectorStoreId;
      const fileQueue = selectedFiles.map((file, i) => ({ file, id: newFiles[i].id }));

      for (let i = 0; i < fileQueue.length; i += UPLOAD_CONCURRENCY) {
        const batch = fileQueue.slice(i, i + UPLOAD_CONCURRENCY);

        const results = await Promise.all(
          batch.map(({ file, id }) => uploadSingleFile(file, id, currentVectorStoreId))
        );

        for (const res of results) {
          if (res.success && res.result) {
            if (res.result.vectorStoreId && !currentVectorStoreId) {
              currentVectorStoreId = res.result.vectorStoreId;
              setVectorStoreId(res.result.vectorStoreId);
            }

            setFiles((prev) =>
              prev.map((f) =>
                f.id === res.fileId
                  ? {
                      ...f,
                      status: "ready" as const,
                      extractedDetails: res.result!.extractedDetails,
                      imageBase64: res.result!.imageBase64,
                    }
                  : f
              )
            );
          } else {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === res.fileId
                  ? {
                      ...f,
                      status: "error" as const,
                      error: res.error || "Upload failed",
                    }
                  : f
              )
            );
          }
        }
      }
    },
    [vectorStoreId, uploadSingleFile]
  );

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleAnalyze = async () => {
    if (!hasReadyFiles || isAnalyzing || !vectorStoreId || !hasImages) return;

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const readyFiles = files.filter((f) => f.status === "ready");
      const images: AnalysisImage[] = readyFiles
        .filter((f) => f.isImage && f.imageBase64)
        .map((f) => ({
          base64: f.imageBase64!,
          mimeType: f.mimeType,
          filename: f.name,
        }));

      const request: AnalyzeRequest = {
        sessionId,
        vectorStoreId,
        context,
        images,
        readyFileNames: readyFiles.map((f) => f.name),
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Analysis failed");
      }

      setReport(result);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    const newId = uuidv4();
    localStorage.setItem(SESSION_KEY, newId);
    setSessionId(newId);
    setVectorStoreId(undefined);
    setFiles([]);
    setContext({
      productName: "",
      productCategory: "",
      abv: "",
      containerSize: "",
      producer: "",
      additionalNotes: "",
    });
    setReport(null);
    setAnalysisError(null);
    setFocusFindingId(undefined);
  };

  const handleAskAboutFinding = useCallback((findingId: string) => {
    setFocusFindingId(findingId);
  }, []);

  const handleJumpToFinding = useCallback((findingId: string) => {
    const element = document.getElementById(`finding-${findingId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const handleClearFocus = useCallback(() => {
    setFocusFindingId(undefined);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">TTB Compliance Checker</h1>
              <p className="text-xs text-gray-500">Alcohol Beverage Label Analysis</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Start Over
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left column: Upload + Report */}
          <section className="lg:flex-1 lg:min-w-0 space-y-4">
            {showUploadPanel ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Upload Label Assets
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                Drop label images (PNG, JPG, WebP) and optional supporting PDFs. Include front/back labels for best results.
              </p>

              {/* Upload area */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-600 mb-1">Click to upload or drag and drop</p>
                <p className="text-sm text-gray-500">PNG, JPG, WEBP, PDF up to 20MB each</p>
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-medium text-gray-700">Files ({files.length})</h3>
                  <ul className="space-y-2">
                    {files.map((file) => (
                      <li key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${file.isImage ? "bg-blue-100" : "bg-blue-100/70"}`}>
                            {file.isImage ? (
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.size)}{file.isImage && " • Label"}</p>
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
                          {file.status === "error" && <span className="text-xs text-red-600">{file.error}</span>}
                          <button onClick={() => removeFile(file.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
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
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    value={context.additionalNotes}
                    onChange={(e) => setContext({ ...context, additionalNotes: e.target.value })}
                    placeholder="Any specific concerns to check..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
              )}

              {/* Analyze button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleAnalyze}
                  disabled={!hasReadyFiles || hasUploadingFiles || !hasImages || isAnalyzing}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                    !hasReadyFiles || hasUploadingFiles || !hasImages || isAnalyzing
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  }`}
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
            </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <ResultsPanel
                  report={report}
                  isLoading={isAnalyzing}
                  error={analysisError}
                  onAskAboutFinding={handleAskAboutFinding}
                />
              </div>
            )}
          </section>

          {/* Right column: Chat */}
          <section className="lg:w-[550px] xl:w-[600px] lg:shrink-0">
            <div className="lg:sticky lg:top-24 bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-8rem)] lg:h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
              <ChatPanel
                sessionId={sessionId}
                vectorStoreId={vectorStoreId || ""}
                report={report}
                images={chatImages}
                onJumpToFinding={handleJumpToFinding}
                focusFindingId={focusFindingId}
                onClearFocus={handleClearFocus}
              />
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-gray-400">
        <p>This tool provides guidance only and does not constitute legal advice.</p>
      </footer>
    </div>
  );
}
