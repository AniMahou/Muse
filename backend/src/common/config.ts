import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number());

const csv = (def: string[]) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? def : v.split(",").map((s) => s.trim()).filter(Boolean),
    );

const ConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: num(4000),
  logLevel: z.string().default("debug"),
  corsOrigin: csv(["http://localhost:5173"]),

  jwtSecret: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  jwtExpiresIn: z.string().default("7d"),

  mongoUri: z.string().default("mongodb://localhost:27018"),
  mongoDb: z.string().default("muse"),
  redisUrl: z.string().default("redis://localhost:6380"),

  asrProvider: z.enum(["groq", "gemini", "local", "fake"]).default("fake"),
  asrLanguage: z.string().default("bn"),
  groqApiKey: z.string().default(""),
  groqAsrModel: z.string().default("whisper-large-v3"),
  geminiApiKey: z.string().default(""),
  geminiAsrModel: z.string().default("gemini-2.0-flash"),
  whisperCppBin: z.string().default(""),
  whisperCppModel: z.string().default(""),

  llmProvider: z.enum(["groq", "gemini", "fake"]).default("fake"),
  groqLlmModel: z.string().default("openai/gpt-oss-120b"),
  geminiLlmModel: z.string().default("gemini-2.0-flash"),
  llmTemperature: num(0),
  llmMaxTokens: num(2048),
  llmTimeoutMs: num(30_000),

  storageDriver: z.enum(["local", "s3"]).default("local"),
  storageLocalDir: z.string().default("./.storage"),

  confidenceThreshold: num(0.8),
  criticalFields: csv(["outlet_id", "sku", "quantity", "competitor_brand"]),
  skuMatchMinScore: num(0.55),
  skuMaxCandidates: num(5),
  outletRadiusM: num(120),
  outletMaxCandidates: num(5),
  clarificationTimeoutHours: num(24),

  traceEnabled: bool(true),
  traceDir: z.string().default("./traces"),
  stageCacheEnabled: bool(true),
  stageCacheDir: z.string().default("./.cache/stages"),
  validateStageIo: bool(true),

  queuePrefix: z.string().default("muse"),
  queueConcurrency: num(4),
  queueMaxAttempts: num(3),
  queueBackoffMs: num(2000),
});

export type Config = z.infer<typeof ConfigSchema>;

function read(): Config {
  const env = process.env;
  const parsed = ConfigSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    corsOrigin: env.CORS_ORIGIN,

    // Dev-only fallback so a fresh clone boots; production must set it.
    jwtSecret:
      env.JWT_SECRET ??
      (env.NODE_ENV === "production" ? undefined : "muse-dev-secret-change-me-in-production"),
    jwtExpiresIn: env.JWT_EXPIRES_IN,

    mongoUri: env.MONGO_URI,
    mongoDb: env.MONGO_DB,
    redisUrl: env.REDIS_URL,

    asrProvider: env.ASR_PROVIDER,
    asrLanguage: env.ASR_LANGUAGE,
    groqApiKey: env.GROQ_API_KEY,
    groqAsrModel: env.GROQ_ASR_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiAsrModel: env.GEMINI_ASR_MODEL,
    whisperCppBin: env.WHISPER_CPP_BIN,
    whisperCppModel: env.WHISPER_CPP_MODEL,

    llmProvider: env.LLM_PROVIDER,
    groqLlmModel: env.GROQ_LLM_MODEL,
    geminiLlmModel: env.GEMINI_LLM_MODEL,
    llmTemperature: env.LLM_TEMPERATURE,
    llmMaxTokens: env.LLM_MAX_TOKENS,
    llmTimeoutMs: env.LLM_TIMEOUT_MS,

    storageDriver: env.STORAGE_DRIVER,
    storageLocalDir: env.STORAGE_LOCAL_DIR,

    confidenceThreshold: env.CONFIDENCE_THRESHOLD,
    criticalFields: env.CRITICAL_FIELDS,
    skuMatchMinScore: env.SKU_MATCH_MIN_SCORE,
    skuMaxCandidates: env.SKU_MAX_CANDIDATES,
    outletRadiusM: env.OUTLET_RADIUS_M,
    outletMaxCandidates: env.OUTLET_MAX_CANDIDATES,
    clarificationTimeoutHours: env.CLARIFICATION_TIMEOUT_HOURS,

    traceEnabled: env.TRACE_ENABLED,
    traceDir: env.TRACE_DIR,
    stageCacheEnabled: env.STAGE_CACHE_ENABLED,
    stageCacheDir: env.STAGE_CACHE_DIR,
    validateStageIo: env.VALIDATE_STAGE_IO,

    queuePrefix: env.QUEUE_PREFIX,
    queueConcurrency: env.QUEUE_CONCURRENCY,
    queueMaxAttempts: env.QUEUE_MAX_ATTEMPTS,
    queueBackoffMs: env.QUEUE_BACKOFF_MS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
  }
  return parsed.data;
}

export const config: Config = read();

/** Provider selections that need a key. Called at startup so failures are loud and early. */
export function assertProviderKeys(c: Config = config): void {
  const missing: string[] = [];
  if (c.asrProvider === "groq" && !c.groqApiKey) missing.push("GROQ_API_KEY (ASR_PROVIDER=groq)");
  if (c.asrProvider === "gemini" && !c.geminiApiKey)
    missing.push("GEMINI_API_KEY (ASR_PROVIDER=gemini)");
  if (c.asrProvider === "local" && !c.whisperCppBin)
    missing.push("WHISPER_CPP_BIN (ASR_PROVIDER=local)");
  if (c.llmProvider === "groq" && !c.groqApiKey) missing.push("GROQ_API_KEY (LLM_PROVIDER=groq)");
  if (c.llmProvider === "gemini" && !c.geminiApiKey)
    missing.push("GEMINI_API_KEY (LLM_PROVIDER=gemini)");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((m) => `  - ${m}`).join("\n")}\n\n` +
        `See docs/MANUAL_SETUP.md for how to obtain each key (all are free, no card required).`,
    );
  }
}
