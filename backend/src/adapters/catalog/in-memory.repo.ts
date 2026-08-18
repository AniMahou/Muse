import type { Alias, Outlet, Sku, GeoPoint } from "@shared/catalog";
import type { ICatalogRepo, IOutletRepo, SkuQuery } from "@/pipeline/ports";
import { haversineMeters } from "@/common/geo";

/**
 * Test double for the catalogue and outlet repositories.
 *
 * Stage tests wire this instead of Mongo, which keeps tier 0/1 free of any
 * container dependency. It implements the same filtering semantics as the
 * Mongo repo — including brand scoping — so a stage test exercises the real
 * candidate-narrowing behaviour rather than an idealised version of it.
 */
export class InMemoryCatalogRepo implements ICatalogRepo {
  constructor(
    private skus: Sku[] = [],
    private aliases: Alias[] = [],
  ) {}

  seedSkus(skus: Sku[]): this {
    this.skus = skus;
    return this;
  }
  seedAliases(aliases: Alias[]): this {
    this.aliases = aliases;
    return this;
  }

  async listSkus(q: SkuQuery): Promise<Sku[]> {
    return this.skus.filter((s) => {
      if (s.companyId !== q.companyId) return false;
      if (!s.active) return false;
      if (q.includeCompetitors === false && s.isCompetitor) return false;
      // Brand scoping: absent or empty means no restriction. Competitor SKUs
      // are never scoped out by portfolio — a rep reports on rivals they do
      // not themselves carry.
      if (q.brands && q.brands.length > 0 && !s.isCompetitor) {
        return q.brands.includes(s.brand);
      }
      return true;
    });
  }

  async listAliases(companyId: string): Promise<Alias[]> {
    return this.aliases.filter((a) => a.companyId === companyId);
  }
}

export class InMemoryOutletRepo implements IOutletRepo {
  constructor(private outlets: Outlet[] = []) {}

  seed(outlets: Outlet[]): this {
    this.outlets = outlets;
    return this;
  }

  async findNear(companyId: string, geo: GeoPoint, radiusM: number): Promise<Outlet[]> {
    return this.outlets
      .filter((o) => o.companyId === companyId && o.active)
      .map((o) => ({ o, d: haversineMeters(geo, o.geo) }))
      .filter(({ d }) => d <= radiusM)
      .sort((a, b) => a.d - b.d)
      .map(({ o }) => o);
  }

  async findById(companyId: string, outletId: string): Promise<Outlet | null> {
    return this.outlets.find((o) => o.companyId === companyId && o.outletId === outletId) ?? null;
  }
}
