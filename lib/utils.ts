import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parsed CFR citation components
 */
export interface CfrCitation {
  title: string;
  part: string;
  section: string;
  subsections: string[];
}

/**
 * Parse a CFR citation string into its components.
 *
 * @param citation - Citation string like "27 CFR 5.65" or "27 CFR 5.65(a)(1)"
 * @returns Parsed citation object or null if invalid
 *
 * @example
 * parseCfrCitation("27 CFR 5.65") // { title: "27", part: "5", section: "65", subsections: [] }
 * parseCfrCitation("27 CFR 5.65(a)(1)") // { title: "27", part: "5", section: "65", subsections: ["a", "1"] }
 */
export function parseCfrCitation(citation: string): CfrCitation | null {
  if (citation === "None" || !citation) {
    return null;
  }

  // Match pattern: "27 CFR 5.65" or "27 CFR 5.65(a)(1)"
  const pattern = /^(\d+)\s+CFR\s+(\d+)\.(\d+)((?:\([a-z0-9]+\))*)$/;
  const match = citation.match(pattern);

  if (!match) {
    return null;
  }

  const [, title, part, section, subsectionsStr] = match;

  // Extract subsections from parentheses: "(a)(1)" -> ["a", "1"]
  const subsections = subsectionsStr
    ? subsectionsStr.match(/\(([a-z0-9]+)\)/g)?.map(s => s.slice(1, -1)) || []
    : [];

  return {
    title,
    part,
    section,
    subsections,
  };
}

/**
 * Convert a CFR citation to a Cornell Law URL.
 * Always points to the base section (without subsections) as Cornell Law doesn't support direct subsection links.
 *
 * @param citation - Citation string like "27 CFR 5.65" or "27 CFR 5.65(a)(1)"
 * @returns Cornell Law URL or null if citation is "None" or invalid
 *
 * @example
 * getCfrUrl("27 CFR 5.65") // "https://www.law.cornell.edu/cfr/text/27/5.65"
 * getCfrUrl("27 CFR 5.65(a)(1)") // "https://www.law.cornell.edu/cfr/text/27/5.65"
 * getCfrUrl("None") // null
 */
export function getCfrUrl(citation: string): string | null {
  const parsed = parseCfrCitation(citation);

  if (!parsed) {
    return null;
  }

  return `https://www.law.cornell.edu/cfr/text/${parsed.title}/${parsed.part}.${parsed.section}`;
}

/**
 * Check if a citation string is a valid CFR citation (not "None")
 *
 * @param citation - Citation string to check
 * @returns true if valid CFR citation
 */
export function isValidCfrCitation(citation: string): boolean {
  return citation !== "None" && parseCfrCitation(citation) !== null;
}
