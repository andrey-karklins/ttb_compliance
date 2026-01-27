/**
 * CLI script to initialize the regulations vector store
 * 
 * Usage:
 *   npx tsx scripts/init-regulations.ts
 * 
 * This will:
 * 1. Create a new vector store (or use existing if REGULATIONS_VECTOR_STORE_ID is set)
 * 2. Upload all files from the docs/ folder
 * 3. Print the vector store ID to add to .env
 */

import path from "path";
import { config } from "dotenv";

// Load .env file from project root
config({ path: path.join(process.cwd(), ".env") });

import { initializeRegulationsStore, listRegulationFiles } from "../lib/regulations";

async function main() {
  console.log("TTB Compliance - Regulations Vector Store Initialization");
  console.log("=".repeat(60));

  const docsPath = path.join(process.cwd(), "docs");
  console.log(`\nDocs folder: ${docsPath}`);

  try {
    const result = await initializeRegulationsStore(docsPath);

    console.log("\n" + "=".repeat(60));
    console.log("RESULT:");
    console.log(`  Vector Store ID: ${result.vectorStoreId}`);
    console.log(`  Is New Store: ${result.isNew}`);
    
    if (result.uploadedFiles.length > 0) {
      console.log(`  Uploaded Files: ${result.uploadedFiles.length}`);
      result.uploadedFiles.forEach((f) => console.log(`    - ${f}`));
    }

    // List current files in store
    console.log("\nFiles in vector store:");
    const files = await listRegulationFiles(result.vectorStoreId);
    files.forEach((f) => console.log(`  - ${f}`));

    console.log("\n" + "=".repeat(60));
    console.log("NEXT STEP:");
    console.log("Add this to your .env file:");
    console.log(`\n  REGULATIONS_VECTOR_STORE_ID=${result.vectorStoreId}\n`);
    
  } catch (error) {
    console.error("\nError:", error);
    process.exit(1);
  }
}

main();
