import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

/**
 * GET /api/docs/[filename]
 * Serve regulation documents from the docs folder
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const docsPath = path.join(process.cwd(), "docs", sanitizedFilename);

    // Check if file exists
    if (!fs.existsSync(docsPath)) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Read the file
    const fileBuffer = fs.readFileSync(docsPath);
    const ext = path.extname(sanitizedFilename).toLowerCase();

    // Determine content type
    let contentType = "application/octet-stream";
    if (ext === ".pdf") contentType = "application/pdf";
    else if (ext === ".txt") contentType = "text/plain";
    else if (ext === ".md") contentType = "text/markdown";

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${sanitizedFilename}"`,
        "Cache-Control": "public, max-age=86400", // Cache for 1 day
      },
    });
  } catch (error) {
    console.error("Error serving document:", error);
    return NextResponse.json({ error: "Failed to serve document" }, { status: 500 });
  }
}
