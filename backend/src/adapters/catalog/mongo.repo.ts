import type { Alias, GeoPoint, Outlet, Sku } from "@shared/catalog";
import type { ICatalogRepo, IOutletRepo, SkuQuery } from "@/pipeline/ports";
import type { Collections } from "@/db/client";

export class MongoCatalogRepo implements ICatalogRepo {
  constructor(private readonly c: Collections) {}

  async listSkus(q: SkuQuery): Promise<Sku[]> {
    // Mirrors InMemoryCatalogRepo exactly, including the rule that competitor
    // SKUs are never scoped out by portfolio — a rep reports on rivals they do
    // not themselves carry.
    const base = { companyId: q.companyId, active: true };

    if (!q.brands || q.brands.length === 0) {
      const filter = q.includeCompetitors === false ? { ...base, isCompetitor: false } : base;
      return this.c.skus.find(filter).toArray();
    }

    const inPortfolio = { ...base, isCompetitor: false, brand: { $in: q.brands } };
    if (q.includeCompetitors === false) return this.c.skus.find(inPortfolio).toArray();

    return this.c.skus
      .find({ ...base, $or: [{ isCompetitor: true }, { brand: { $in: q.brands } }] })
      .toArray();
  }

  async listAliases(companyId: string): Promise<Alias[]> {
    return this.c.aliases.find({ companyId }).toArray();
  }
}

export class MongoOutletRepo implements IOutletRepo {
  constructor(private readonly c: Collections) {}

  async findNear(companyId: string, geo: GeoPoint, radiusM: number): Promise<Outlet[]> {
    const docs = await this.c.outlets
      .find({
        companyId,
        active: true,
        location: {
          $nearSphere: {
            $geometry: { type: "Point", coordinates: [geo.lng, geo.lat] },
            $maxDistance: radiusM,
          },
        },
      })
      .toArray();

    // Strip the GeoJSON mirror; the domain speaks flat lat/lng.
    return docs.map(({ location: _location, ...outlet }) => outlet as Outlet);
  }

  async findById(companyId: string, outletId: string): Promise<Outlet | null> {
    const doc = await this.c.outlets.findOne({ companyId, outletId });
    if (!doc) return null;
    const { location: _location, ...outlet } = doc;
    return outlet as Outlet;
  }
}
