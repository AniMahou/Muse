/**
 * Minimal RFC-4180 CSV reader.
 *
 * Written rather than pulled in because the requirement is narrow and the
 * failure modes are specific to this data: a Bangladeshi outlet master will
 * contain Bangla names with commas inside quotes, a UTF-8 BOM from Excel, and
 * CRLF line endings. A parser that mishandles any of those corrupts master
 * data silently, which is worse than rejecting the file.
 */
export interface CsvParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export function parseCsv(input: string): CsvParseResult {
  // Excel on Windows writes a BOM; leaving it in makes the first header
  // never match its own name.
  const text = input.replace(/^\uFEFF/, "");

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Swallow the LF of a CRLF pair.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((f) => f.length > 0)) records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }

  record.push(field);
  if (record.some((f) => f.length > 0)) records.push(record);

  const headerRow = records.shift();
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((h) => h.trim());
  const rows = records.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

/** Split a delimited cell, e.g. a rep's brand portfolio. */
export function splitList(value: string): string[] {
  return value
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseBool(value: string, fallback = true): boolean {
  const v = value.trim().toLowerCase();
  if (v === "") return fallback;
  return ["1", "true", "yes", "y", "active"].includes(v);
}
