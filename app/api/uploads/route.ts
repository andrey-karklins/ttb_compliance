import { NextRequest, NextResponse } from "next/server";
import {
  getOpenAIClient,
  createSessionVectorStore,
  uploadFileToVectorStore,
  extractFromLabelImage,
} from "@/lib/openai";
import type { UploadResponse, ExtractedDetails } from "@/lib/schema";

const ALLOWED_TYPES = {
  "application/pdf": "document",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
  "text/plain": "document",
  "text/markdown": "document",
} as const;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get("sessionId") as string;
    let vectorStoreId = formData.get("vectorStoreId") as string | null;
    const file = formData.get("file") as File;

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const mimeType = file.type as keyof typeof ALLOWED_TYPES;
    if (!ALLOWED_TYPES[mimeType]) {
      return NextResponse.json(
        { error: `File type ${file.type} is not supported` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
        { status: 400 }
      );
    }

    const client = getOpenAIClient();

    // Create vector store if not provided
    if (!vectorStoreId) {
      vectorStoreId = await createSessionVectorStore(client, sessionId);
    }

    let extractedDetails: ExtractedDetails | undefined;
    const fileCategory = ALLOWED_TYPES[mimeType];
    const isImage = fileCategory === "image";

    // Get file buffer
    const arrayBuffer = await file.arrayBuffer();

    let imageBase64: string | undefined;

    if (isImage) {
      // For images: quick OCR for autofill + store base64 for analysis
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      imageBase64 = base64; // Return to client for analysis
      
      const extraction = await extractFromLabelImage(client, base64, mimeType);
      extractedDetails = extraction.extractedDetails;

      // Upload extracted text to vector store
      const textContent = extraction.extractedText || "No text extracted from image";
      const textBuffer = new TextEncoder().encode(textContent).buffer;
      const textFilename = `${file.name.replace(/\.[^.]+$/, "")}_extracted.txt`;

      await uploadFileToVectorStore(
        client,
        vectorStoreId,
        textBuffer,
        textFilename,
        "text/plain"
      );
    } else {
      // For PDFs and text documents, upload directly
      await uploadFileToVectorStore(
        client,
        vectorStoreId,
        arrayBuffer,
        file.name,
        mimeType
      );
    }

    const response: UploadResponse = {
      success: true,
      vectorStoreId,
      filename: file.name,
      isImage,
      extractedDetails,
      imageBase64,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
