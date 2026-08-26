import { io, type Socket } from "socket.io-client";
import type { Observation } from "@shared/observation.schema";
import type { Alert } from "@shared/alert.schema";

let socket: Socket | null = null;

/**
 * One shared connection for the console.
 *
 * Joins a per-company room, which is the tenancy boundary — a socket that has
 * not joined receives nothing, so field intelligence cannot leak sideways
 * between tenants.
 */
export function connectRealtime(companyId: string): Socket {
  if (socket?.connected) return socket;
  // Polling first, then silent upgrade to websocket. Listing websocket first
  // logs a failed connection attempt in the console whenever a proxy or
  // network does not pass ws through — harmless, but it looks like a fault
  // during a demo.
  socket = io({ path: "/socket.io", transports: ["polling", "websocket"] });
  socket.on("connect", () => socket?.emit("join", companyId));
  return socket;
}

export function onObservations(fn: (rows: Observation[]) => void): () => void {
  socket?.on("observations:created", fn);
  return () => void socket?.off("observations:created", fn);
}

export function onObservationUpdated(fn: (row: Observation) => void): () => void {
  socket?.on("observation:updated", fn);
  return () => void socket?.off("observation:updated", fn);
}

export function onAlertRaised(fn: (a: Alert) => void): () => void {
  socket?.on("alert:raised", fn);
  return () => void socket?.off("alert:raised", fn);
}

export function onAlertUpdated(fn: (a: Alert) => void): () => void {
  socket?.on("alert:updated", fn);
  return () => void socket?.off("alert:updated", fn);
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}
