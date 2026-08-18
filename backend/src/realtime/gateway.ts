import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import type { Observation } from "@shared/observation.schema";
import { config } from "@/common/config";
import { logger } from "@/common/logger";

/**
 * Live updates to the admin dashboard.
 *
 * Rooms are per-company, which is the tenancy boundary. A socket that has not
 * joined a company room receives nothing — field intelligence is exactly the
 * kind of data that must not leak sideways between tenants.
 */
export class RealtimeGateway {
  private io: SocketServer | null = null;

  attach(server: HttpServer): SocketServer {
    this.io = new SocketServer(server, {
      cors: { origin: config.corsOrigin, credentials: true },
      path: "/socket.io",
    });

    this.io.on("connection", (socket) => {
      socket.on("join", (companyId: unknown) => {
        if (typeof companyId !== "string" || companyId.length === 0) return;
        void socket.join(room(companyId));
        logger.debug({ companyId, sid: socket.id }, "socket joined company room");
      });
    });

    return this.io;
  }

  clipStatus(companyId: string, payload: { clipId: string; status: string; error?: string }): void {
    this.io?.to(room(companyId)).emit("clip:status", payload);
  }

  observationsCreated(companyId: string, observations: Observation[]): void {
    if (observations.length === 0) return;
    this.io?.to(room(companyId)).emit("observations:created", observations);
  }

  observationUpdated(companyId: string, observation: Observation): void {
    this.io?.to(room(companyId)).emit("observation:updated", observation);
  }

  async close(): Promise<void> {
    await this.io?.close();
    this.io = null;
  }
}

const room = (companyId: string) => `company:${companyId}`;
