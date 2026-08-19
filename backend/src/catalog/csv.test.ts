import { describe, it, expect } from "vitest";
import { parseCsv, splitList, parseBool } from "./csv";

describe("parseCsv", () => {
  it("reads a simple file", () => {
    const { headers, rows } = parseCsv("skuId,name\nSKU-1,Lux Soap\n");
    expect(headers).toEqual(["skuId", "name"]);
    expect(rows).toEqual([{ skuId: "SKU-1", name: "Lux Soap" }]);
  });

  it("keeps commas inside quoted fields", () => {
    // An outlet master will contain these; splitting on every comma corrupts
    // master data silently.
    const { rows } = parseCsv('outletId,name\nOUT-1,"Bijoy Store, Mirpur-2"\n');
    expect(rows[0]!.name).toBe("Bijoy Store, Mirpur-2");
  });

  it("handles escaped quotes", () => {
    const { rows } = parseCsv('a\n"say ""hi"""\n');
    expect(rows[0]!.a).toBe('say "hi"');
  });

  it("strips the UTF-8 BOM Excel writes", () => {
    // Without this the first header never matches its own name.
    const { headers } = parseCsv("﻿skuId,name\nSKU-1,X\n");
    expect(headers[0]).toBe("skuId");
  });

  it("handles CRLF line endings", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ a: "3", b: "4" });
  });

  it("preserves Bangla text", () => {
    const { rows } = parseCsv("outletId,name\nOUT-1,বিজয় স্টোর\n");
    expect(rows[0]!.name).toBe("বিজয় স্টোর");
  });

  it("keeps Bangla inside quotes with commas", () => {
    const { rows } = parseCsv('outletId,name\nOUT-1,"বিজয় স্টোর, মিরপুর"\n');
    expect(rows[0]!.name).toBe("বিজয় স্টোর, মিরপুর");
  });

  it("skips blank lines", () => {
    const { rows } = parseCsv("a,b\n1,2\n\n\n3,4\n");
    expect(rows).toHaveLength(2);
  });

  it("pads short rows rather than dropping them", () => {
    const { rows } = parseCsv("a,b,c\n1,2\n");
    expect(rows[0]).toEqual({ a: "1", b: "2", c: "" });
  });

  it("trims surrounding whitespace", () => {
    const { rows } = parseCsv("a, b\n 1 , 2 \n");
    expect(rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("returns empty for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("handles a header-only file", () => {
    expect(parseCsv("a,b\n").rows).toEqual([]);
  });

  it("handles a file with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2").rows).toHaveLength(1);
  });
});

describe("splitList", () => {
  it("splits on semicolons and pipes", () => {
    expect(splitList("PRAN; Lux |Surf Excel")).toEqual(["PRAN", "Lux", "Surf Excel"]);
  });
  it("returns empty for blank", () => {
    expect(splitList("")).toEqual([]);
  });
});

describe("parseBool", () => {
  it("accepts the usual truthy spellings", () => {
    for (const v of ["1", "true", "TRUE", "yes", "y", "active"]) expect(parseBool(v)).toBe(true);
  });
  it("treats anything else as false", () => {
    for (const v of ["0", "false", "no", "inactive"]) expect(parseBool(v)).toBe(false);
  });
  it("uses the fallback when blank", () => {
    expect(parseBool("", true)).toBe(true);
    expect(parseBool("", false)).toBe(false);
  });
});
