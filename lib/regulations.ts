import OpenAI, { toFile } from "openai";
import { getOpenAIClient } from "./openai";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Persistent Regulations Vector Store
// ============================================================================

/**
 * Environment variable for the regulations vector store ID
 * This should be set once and reused across all sessions
 */
const REGULATIONS_VECTOR_STORE_ID_KEY = "REGULATIONS_VECTOR_STORE_ID";

/**
 * Name for the persistent regulations vector store
 */
const REGULATIONS_STORE_NAME = "ttb-regulations-persistent";

/**
 * Supported file types for regulations
 */
const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"];

/**
 * Get the regulations vector store ID from environment
 */
export function getRegulationsVectorStoreId(): string | undefined {
  return process.env[REGULATIONS_VECTOR_STORE_ID_KEY];
}

/**
 * Check if a regulations vector store exists and is valid
 */
export async function checkRegulationsVectorStore(
  client: OpenAI,
  vectorStoreId: string
): Promise<boolean> {
  try {
    const store = await client.vectorStores.retrieve(vectorStoreId);
    return store.status === "completed" || store.status === "in_progress";
  } catch {
    return false;
  }
}

/**
 * Create a new persistent regulations vector store
 * Note: Does NOT expire (no expires_after)
 */
export async function createRegulationsVectorStore(client: OpenAI): Promise<string> {
  const vectorStore = await client.vectorStores.create({
    name: REGULATIONS_STORE_NAME,
    // No expires_after - this store persists indefinitely
  });

  return vectorStore.id;
}

/**
 * Upload a single file to the regulations vector store
 */
export async function uploadRegulationFile(
  client: OpenAI,
  vectorStoreId: string,
  filePath: string
): Promise<{ filename: string; fileId: string }> {
  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Determine MIME type
  let mimeType = "text/plain";
  if (ext === ".pdf") mimeType = "application/pdf";
  else if (ext === ".md") mimeType = "text/markdown";

  // Convert to OpenAI file format
  const file = await toFile(fileBuffer, filename, { type: mimeType });

  // Upload to OpenAI
  const uploadedFile = await client.files.create({
    file: file,
    purpose: "assistants",
  });

  // Add to vector store and wait for processing
  await client.vectorStores.files.createAndPoll(vectorStoreId, {
    file_id: uploadedFile.id,
  });

  return { filename, fileId: uploadedFile.id };
}

/**
 * List all files in the docs directory
 */
export function listDocsFiles(docsPath: string): string[] {
  if (!fs.existsSync(docsPath)) {
    return [];
  }

  return fs.readdirSync(docsPath)
    .filter((file) => SUPPORTED_EXTENSIONS.includes(path.extname(file).toLowerCase()))
    .map((file) => path.join(docsPath, file));
}

/**
 * Initialize or get the regulations vector store
 * Returns the vector store ID
 */
export async function initializeRegulationsStore(docsPath: string): Promise<{
  vectorStoreId: string;
  isNew: boolean;
  uploadedFiles: string[];
}> {
  const client = getOpenAIClient();
  let vectorStoreId = getRegulationsVectorStoreId();
  let isNew = false;
  const uploadedFiles: string[] = [];

  // Check if existing store is valid
  if (vectorStoreId) {
    const isValid = await checkRegulationsVectorStore(client, vectorStoreId);
    if (!isValid) {
      console.log("Existing regulations vector store is invalid, creating new one...");
      vectorStoreId = undefined;
    }
  }

  // Create new store if needed
  if (!vectorStoreId) {
    vectorStoreId = await createRegulationsVectorStore(client);
    isNew = true;
    console.log(`Created new regulations vector store: ${vectorStoreId}`);
  }

  // Get files to upload
  const files = listDocsFiles(docsPath);

  if (files.length === 0) {
    console.log("No regulation files found in docs directory");
    return { vectorStoreId, isNew, uploadedFiles };
  }

  // If new store, upload all files
  if (isNew) {
    console.log(`Uploading ${files.length} regulation files...`);
    for (const filePath of files) {
      try {
        const result = await uploadRegulationFile(client, vectorStoreId, filePath);
        uploadedFiles.push(result.filename);
        console.log(`  Uploaded: ${result.filename}`);
      } catch (error) {
        console.error(`  Failed to upload ${path.basename(filePath)}:`, error);
      }
    }
  }

  return { vectorStoreId, isNew, uploadedFiles };
}

/**
 * Get list of files in the regulations vector store
 */
export async function listRegulationFiles(vectorStoreId: string): Promise<string[]> {
  const client = getOpenAIClient();
  const files: string[] = [];

  const response = await client.vectorStores.files.list(vectorStoreId);
  
  for await (const file of response) {
    // Get file details
    try {
      const fileDetails = await client.files.retrieve(file.id);
      files.push(fileDetails.filename);
    } catch {
      files.push(file.id);
    }
  }

  return files;
}
