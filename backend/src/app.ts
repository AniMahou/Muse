import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { AppError } from "@/common/errors";
import { logger } from "@/common/logger";
import { config } from "@/common/config";
import type { Container } from "@/container";
import type { UploadService } from "@/ingest/upload.service";
import { ingestRoutes } from "@/ingest/routes";
import { clarificationRoutes } from "@/clarification/routes";
import { adminRoutes } from "@/admin/routes";
import { authRoutes } from "@/auth/routes";

/**
 * Builds the Express app. Deliberately does NOT call listen — server.ts owns
 * the socket, and tests want an app they can drive without binding a port.
 */
export function buildApp(container: Container, uploads: UploadService): Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  // Audio arrives base64 inside JSON; the limit accommodates a 10 MB clip
  // plus encoding overhead.
  app.use(express.json({ limit: "16mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, asr: container.asr.name, llm: container.llm.name });
  });

  app.use("/api", authRoutes(container.auth));
  app.use("/api", ingestRoutes(container, uploads));
  app.use("/api", clarificationRoutes(container.collections, container.clarifications));
  app.use(
    "/api/admin",
    // CSV arrives as a raw text body; JSON parsing would reject it.
    express.text({ type: ["text/csv", "text/plain"], limit: "8mb" }),
    adminRoutes({
      collections: container.collections,
      repo: container.repo,
      imports: container.imports,
      aliases: container.aliases,
      analytics: container.analytics,
      clarifications: container.clarifications,
    }),
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      // 5xx is ours to fix and worth a stack; 4xx is the caller's and is noise.
      if (err.status >= 500) logger.error({ err }, err.message);
      res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
      return;
    }
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
