import { NextResponse } from "next/server";
import path from "path";
import {
  initializeRegulationsStore,
  listRegulationFiles,
  getRegulationsVectorStoreId,
} from "@/lib/regulations";

/**
 * POST /api/init-regulations
 * Initialize or refresh the regulations vector store from docs folder
 */
export async function POST() {
  try {
    const docsPath = path.join(process.cwd(), "docs");

    const result = await initializeRegulationsStore(docsPath);

    return NextResponse.json({
      success: true,
      vectorStoreId: result.vectorStoreId,
      isNew: result.isNew,
      uploadedFiles: result.uploadedFiles,
      message: result.isNew
        ? `Created new regulations store with ${result.uploadedFiles.length} files`
        : "Using existing regulations store",
    });
  } catch (error) {
    console.error("Failed to initialize regulations:", error);
    const message = error instanceof Error ? error.message : "Initialization failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/init-regulations
 * Get status of the regulations vector store
 */
export async function GET() {
  try {
    const vectorStoreId = getRegulationsVectorStoreId();

    if (!vectorStoreId) {
      return NextResponse.json({
        initialized: false,
        message: "Regulations vector store not configured. Set REGULATIONS_VECTOR_STORE_ID in .env",
      });
    }

    const files = await listRegulationFiles(vectorStoreId);

    return NextResponse.json({
      initialized: true,
      vectorStoreId,
      fileCount: files.length,
      files,
    });
  } catch (error) {
    console.error("Failed to get regulations status:", error);
    const message = error instanceof Error ? error.message : "Status check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
