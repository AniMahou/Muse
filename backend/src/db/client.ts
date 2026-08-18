import { MongoClient, type Collection, type Db } from "mongodb";
import type { Alias, Company, Outlet, Rep, Sku, Territory } from "@shared/catalog";
import type { Clip, Observation } from "@shared/observation.schema";
import { config } from "@/common/config";
import { logger } from "@/common/logger";

/**
 * Outlets are stored with a GeoJSON `location` alongside the flat lat/lng so
 * Mongo can serve a $nearSphere query. The flat pair stays because it is what
 * the domain schema and every other layer speak.
 */
export type OutletDoc = Outlet & {
  location: { type: "Point"; coordinates: [number, number] };
};

/** Reps carry an opaque token used by the PWA. Never logged, never returned. */
export type RepDoc = Rep & { inviteToken?: string };

export interface Collections {
  companies: Collection<Company>;
  reps: Collection<RepDoc>;
  territories: Collection<Territory>;
  skus: Collection<Sku>;
  aliases: Collection<Alias>;
  outlets: Collection<OutletDoc>;
  clips: Collection<Clip>;
  observations: Collection<Observation>;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(uri = config.mongoUri, name = config.mongoDb): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(name);
  logger.info({ db: name }, "mongo connected");
  return db;
}

export function collections(database: Db): Collections {
  return {
    companies: database.collection<Company>("companies"),
    reps: database.collection<RepDoc>("reps"),
    territories: database.collection<Territory>("territories"),
    skus: database.collection<Sku>("skus"),
    aliases: database.collection<Alias>("aliases"),
    outlets: database.collection<OutletDoc>("outlets"),
    clips: database.collection<Clip>("clips"),
    observations: database.collection<Observation>("observations"),
  };
}

export async function ensureIndexes(database: Db): Promise<void> {
  const c = collections(database);

  await Promise.all([
    c.companies.createIndex({ companyId: 1 }, { unique: true }),

    c.reps.createIndex({ repId: 1 }, { unique: true }),
    c.reps.createIndex({ companyId: 1, active: 1 }),
    // Sparse: only provisioned reps hold a token.
    c.reps.createIndex({ inviteToken: 1 }, { unique: true, sparse: true }),

    c.skus.createIndex({ companyId: 1, skuId: 1 }, { unique: true }),
    // Brand scoping is the hot path for stage 3's candidate narrowing.
    c.skus.createIndex({ companyId: 1, brand: 1, active: 1 }),

    c.aliases.createIndex({ companyId: 1, surface: 1, skuId: 1 }, { unique: true }),
    c.aliases.createIndex({ companyId: 1 }),

    c.outlets.createIndex({ companyId: 1, outletId: 1 }, { unique: true }),
    c.outlets.createIndex({ location: "2dsphere" }),
    c.outlets.createIndex({ companyId: 1, territoryId: 1 }),

    // The idempotency guarantee, enforced by the database rather than by
    // hope. Redis rejects duplicates fast; this makes it impossible.
    c.clips.createIndex({ companyId: 1, clientUuid: 1 }, { unique: true }),
    c.clips.createIndex({ clipId: 1 }, { unique: true }),
    c.clips.createIndex({ companyId: 1, recordedAt: -1 }),
    c.clips.createIndex({ companyId: 1, status: 1 }),

    c.observations.createIndex({ observationId: 1 }, { unique: true }),
    c.observations.createIndex({ companyId: 1, createdAt: -1 }),
    c.observations.createIndex({ companyId: 1, status: 1, createdAt: -1 }),
    c.observations.createIndex({ clipId: 1 }),
    c.observations.createIndex({ companyId: 1, outletId: 1, createdAt: -1 }),
    c.observations.createIndex({ companyId: 1, skuId: 1, createdAt: -1 }),
  ]);

  logger.info("mongo indexes ensured");
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

export function toOutletDoc(outlet: Outlet): OutletDoc {
  return {
    ...outlet,
    location: { type: "Point", coordinates: [outlet.geo.lng, outlet.geo.lat] },
  };
}
