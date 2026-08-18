import type { GeoPoint } from "@shared/catalog";

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Accuracy matters here in a specific way: consumer GPS in a dense Dhaka
 * market is good to roughly 10-30 metres, and a market can hold a dozen shops
 * inside that error. So geo alone can never identify an outlet — it narrows a
 * candidate set that the spoken name then disambiguates. Stage 4 depends on
 * both signals for exactly this reason.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance mapped to 0..1, where 0 metres scores 1 and `radiusM` scores 0.
 * Linear rather than inverse-square: the difference between 10 m and 30 m is
 * mostly GPS noise, not signal, so a sharp falloff would overweight it.
 */
export function proximityScore(distanceM: number, radiusM: number): number {
  if (radiusM <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distanceM / radiusM));
}
