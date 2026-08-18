import type { Alias, Outlet, Sku, GeoPoint } from "@shared/catalog";

export interface SkuQuery {
  companyId: string;
  /**
   * Restrict to these brands.
   *
   * This is the scale mechanism, not a convenience filter. A rep sells 50-200
   * SKUs, not the company's full catalogue of thousands. Scoping to their
   * portfolio shrinks the search space AND removes confusable candidates they
   * could not possibly have said, so accuracy goes *up* as the catalogue grows
   * — provided this is populated.
   */
  brands?: string[];
  includeCompetitors?: boolean;
}

export interface ICatalogRepo {
  listSkus(q: SkuQuery): Promise<Sku[]>;
  listAliases(companyId: string): Promise<Alias[]>;
}

export interface IOutletRepo {
  findNear(companyId: string, geo: GeoPoint, radiusM: number): Promise<Outlet[]>;
  findById(companyId: string, outletId: string): Promise<Outlet | null>;
}
