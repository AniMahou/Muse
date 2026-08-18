import type { Outlet } from "@shared/catalog";

const C = "acme-bd";

/**
 * A cluster of shops modelled on a real Dhaka market block.
 *
 * Three sit within twenty metres of each other — the situation the resolver
 * exists for, where GPS alone cannot possibly decide. Two share the generic
 * tail "Store", so the distinctive part of the name has to carry the match.
 * One sits far away to verify the radius filter.
 */
const BASE = { lat: 23.7806, lng: 90.4074 };

const at = (dLat: number, dLng: number) => ({
  lat: BASE.lat + dLat,
  lng: BASE.lng + dLng,
});

export const OUTLETS: Outlet[] = [
  {
    outletId: "OUT-1182",
    companyId: C,
    name: "Bijoy Store",
    geo: at(0.00016, 0), // ~18 m north
    territoryId: "T-MIRPUR",
    active: true,
  },
  {
    outletId: "OUT-1183",
    companyId: C,
    name: "Rahman Store",
    geo: at(0.00009, 0.00008), // ~13 m
    territoryId: "T-MIRPUR",
    active: true,
  },
  {
    outletId: "OUT-1184",
    companyId: C,
    name: "New Alam Enterprise",
    geo: at(-0.00014, 0.00005), // ~16 m
    territoryId: "T-MIRPUR",
    active: true,
  },
  {
    outletId: "OUT-9001",
    companyId: C,
    name: "Faraway Traders",
    geo: at(0.02, 0.02), // ~2.9 km
    territoryId: "T-OTHER",
    active: true,
  },
  {
    outletId: "OUT-9002",
    companyId: C,
    name: "Closed Shop",
    geo: at(0.0001, 0),
    territoryId: "T-MIRPUR",
    active: false,
  },
];

export const NEAR_GEO = BASE;
export const COMPANY_ID = C;
