import type { Alias, Outlet, Rep, Sku } from "@shared/catalog";
import { OutletSchema, RepSchema, SkuSchema } from "@shared/catalog";
import type { Collections } from "@/db/client";
import { toOutletDoc } from "@/db/client";
import { ValidationError } from "@/common/errors";
import { parseCsv, splitList, parseBool } from "./csv";

export interface ImportReport {
  kind: "skus" | "outlets" | "reps";
  parsed: number;
  imported: number;
  skipped: Array<{ row: number; reason: string }>;
}

/**
 * Bulk import of master data.
 *
 * An importer, not a CRUD form — which mirrors how this would actually be
 * deployed. Muse is NOT the system of record for products, outlets or reps;
 * an FMCG company already holds those in SAP or a distributor management
 * system. The only master data Muse owns is the alias table.
 *
 * Rows are validated individually and bad ones are REPORTED rather than
 * aborting the batch. A 2,000-row outlet master with three malformed rows
 * should import 1,997 outlets and tell you about the three, not reject
 * everything.
 */
export class CatalogImportService {
  constructor(private readonly c: Collections) {}

  async importSkus(companyId: string, csv: string): Promise<ImportReport> {
    const { headers, rows } = parseCsv(csv);
    requireHeaders(headers, ["skuId", "name", "brand"]);

    const report: ImportReport = { kind: "skus", parsed: rows.length, imported: 0, skipped: [] };

    for (const [i, row] of rows.entries()) {
      const candidate = {
        skuId: row.skuId,
        companyId,
        name: row.name,
        brand: row.brand,
        ...(row.pack ? { pack: row.pack } : {}),
        ...(row.manufacturer ? { manufacturer: row.manufacturer } : {}),
        isCompetitor: parseBool(row.isCompetitor ?? "", false),
        active: parseBool(row.active ?? "", true),
      };

      const parsed = SkuSchema.safeParse(candidate);
      if (!parsed.success) {
        report.skipped.push({ row: i + 2, reason: issueText(parsed.error.issues) });
        continue;
      }
      await this.c.skus.updateOne(
        { companyId, skuId: parsed.data.skuId },
        { $set: parsed.data as Sku },
        { upsert: true },
      );
      report.imported++;
    }
    return report;
  }

  async importOutlets(companyId: string, csv: string): Promise<ImportReport> {
    const { headers, rows } = parseCsv(csv);
    requireHeaders(headers, ["outletId", "name", "lat", "lng"]);

    const report: ImportReport = { kind: "outlets", parsed: rows.length, imported: 0, skipped: [] };

    for (const [i, row] of rows.entries()) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        report.skipped.push({ row: i + 2, reason: "lat/lng is not a number" });
        continue;
      }

      const parsed = OutletSchema.safeParse({
        outletId: row.outletId,
        companyId,
        name: row.name,
        geo: { lat, lng },
        ...(row.territoryId ? { territoryId: row.territoryId } : {}),
        ...(row.address ? { address: row.address } : {}),
        active: parseBool(row.active ?? "", true),
      });
      if (!parsed.success) {
        report.skipped.push({ row: i + 2, reason: issueText(parsed.error.issues) });
        continue;
      }

      await this.c.outlets.updateOne(
        { companyId, outletId: parsed.data.outletId },
        { $set: toOutletDoc(parsed.data as Outlet) },
        { upsert: true },
      );
      report.imported++;
    }
    return report;
  }

  async importReps(companyId: string, csv: string): Promise<ImportReport> {
    const { headers, rows } = parseCsv(csv);
    requireHeaders(headers, ["repId", "name"]);

    const report: ImportReport = { kind: "reps", parsed: rows.length, imported: 0, skipped: [] };

    for (const [i, row] of rows.entries()) {
      const parsed = RepSchema.safeParse({
        repId: row.repId,
        companyId,
        name: row.name,
        ...(row.phone ? { phone: row.phone } : {}),
        ...(row.territoryId ? { territoryId: row.territoryId } : {}),
        brandPortfolio: splitList(row.brandPortfolio ?? ""),
        active: parseBool(row.active ?? "", true),
      });
      if (!parsed.success) {
        report.skipped.push({ row: i + 2, reason: issueText(parsed.error.issues) });
        continue;
      }

      // Never overwrite an existing invite token on re-import — that would
      // silently sign every rep out of the field app mid-route.
      await this.c.reps.updateOne(
        { repId: parsed.data.repId },
        { $set: parsed.data as Rep },
        { upsert: true },
      );
      report.imported++;
    }
    return report;
  }
}

function requireHeaders(headers: string[], required: string[]): void {
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new ValidationError(
      `CSV is missing required column(s): ${missing.join(", ")}. Found: ${headers.join(", ")}`,
    );
  }
}

function issueText(issues: Array<{ path: Array<string | number>; message: string }>): string {
  return issues.map((i) => `${i.path.join(".") || "(row)"}: ${i.message}`).join("; ");
}

export type { Alias };
