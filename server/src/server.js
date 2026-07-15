import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pg from "pg";
import { z } from "zod";
import { hashPassword, verifyPassword } from "./security.js";
import {
  fetchAdmissionTerms,
  OfficialServiceError,
  queryOfficialVisa
} from "./official-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(__dirname, "../public");

const environment = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    PUBLIC_ORIGIN: z.string().url(),
    PUBLIC_ORIGINS: z.string().optional(),
    SESSION_SECRET: z.string().min(32),
    ALLOW_REGISTRATION: z.string().default("true"),
    DATABASE_SSL: z.string().default("false")
  })
  .parse(process.env);

const publicOrigin = environment.PUBLIC_ORIGIN.replace(/\/$/, "");
const publicOrigins = new Set(
  (environment.PUBLIC_ORIGINS || publicOrigin)
    .split(",")
    .map((origin) => new URL(origin.trim()).origin)
);
const isProduction = environment.NODE_ENV === "production";
const allowRegistration = environment.ALLOW_REGISTRATION.toLowerCase() === "true";
const pool = new pg.Pool({
  connectionString: environment.DATABASE_URL,
  ssl:
    environment.DATABASE_SSL.toLowerCase() === "true"
      ? { rejectUnauthorized: true }
      : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

await runMigrations();

const PgSession = connectPgSimple(session);
const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  })
);
app.use(express.json({ limit: "64kb" }));
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    name: "eduhkvisa.sid",
    secret: environment.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const officialQueryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "查询次数过多，请稍后再试。" }
});

app.get("/health", async (_request, response) => {
  await pool.query("SELECT 1");
  response.json({ ok: true });
});

app.get("/api/me", (request, response) => {
  response.json({
    authenticated: Boolean(request.session.userId),
    user: request.session.userId
      ? { id: request.session.userId, email: request.session.email }
      : null,
    allowRegistration
  });
});

app.post(
  "/api/auth/register",
  authLimiter,
  requireSameOrigin,
  asyncHandler(async (request, response) => {
    if (!allowRegistration) {
      return response.status(403).json({ message: "管理员暂时关闭了新用户注册。" });
    }

    const credentials = parseCredentials(request.body);
    const passwordHash = await hashPassword(credentials.password);

    try {
      const result = await pool.query(
        "INSERT INTO portal_users(email, password_hash) VALUES($1, $2) RETURNING id, email",
        [credentials.email, passwordHash]
      );
      await signIn(request, result.rows[0]);
      response.status(201).json({ ok: true, user: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return response.status(409).json({ message: "这个邮箱已经注册，请直接登录。" });
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/login",
  authLimiter,
  requireSameOrigin,
  asyncHandler(async (request, response) => {
    const credentials = parseCredentials(request.body);
    const result = await pool.query(
      "SELECT id, email, password_hash FROM portal_users WHERE email = $1",
      [credentials.email]
    );
    const user = result.rows[0];
    const passwordIsValid = user
      ? await verifyPassword(credentials.password, user.password_hash)
      : false;

    if (!passwordIsValid) {
      return response.status(401).json({ message: "邮箱或密码不正确。" });
    }

    await signIn(request, user);
    response.json({ ok: true, user: { id: user.id, email: user.email } });
  })
);

app.post("/api/auth/logout", requireSameOrigin, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie("eduhkvisa.sid");
    response.json({ ok: true });
  });
});

app.get(
  "/api/official/terms",
  requireAuth,
  asyncHandler(async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({ ok: true, terms: await fetchAdmissionTerms() });
  })
);

app.post(
  "/api/official/query",
  officialQueryLimiter,
  requireSameOrigin,
  requireAuth,
  asyncHandler(async (request, response) => {
    const credentials = parseOfficialCredentials(request.body);
    const data = await queryOfficialVisa(credentials);
    response.setHeader("Cache-Control", "no-store");
    response.json({ ok: true, data });
  })
);

app.use(express.static(publicDirectory, { extensions: ["html"] }));
app.get(["/", "/connect"], (_request, response) => {
  response.sendFile(path.join(publicDirectory, "index.html"));
});

app.use((error, request, response, _next) => {
  console.error(error);
  if (request.path.startsWith("/api/official/")) {
    return response.status(502).json({
      message: "查询过程中出现异常，但你的签证资料没有被保存。请稍后重试；如持续出现，可改用本机插件版本。"
    });
  }
  response.status(500).json({ message: "服务器暂时无法处理请求，请稍后再试。" });
});

const server = app.listen(environment.PORT, () => {
  console.log(`EduHK Visa Portal listening on port ${environment.PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await pool.end();
    process.exit(0);
  });
}

async function runMigrations() {
  const sql = await fs.readFile(path.join(__dirname, "migrations.sql"), "utf8");
  await pool.query(sql);
}

function parseCredentials(body) {
  return z
    .object({
      email: z.string().trim().toLowerCase().email().max(254),
      password: z.string().min(10).max(128)
    })
    .parse(body);
}

function parseOfficialCredentials(body) {
  const credentials = z
    .object({
      applicantNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,9}$/),
      idType: z.enum(["MAINLAND_ID", "PASSPORT"]),
      id: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,30}$/),
      dob: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
      admissionTerm: z.string().regex(/^\d{6}$/)
    })
    .parse(body);

  const [month, day, year] = credentials.dob.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new z.ZodError([]);
  }

  return credentials;
}

function requireAuth(request, response, next) {
  if (!request.session.userId) {
    return response.status(401).json({ message: "请先登录签证中心。" });
  }
  next();
}

function requireSameOrigin(request, response, next) {
  const origin = request.get("origin");
  if (origin && !publicOrigins.has(origin)) {
    return response.status(403).json({ message: "请求来源不被允许。" });
  }
  next();
}

async function signIn(request, user) {
  await new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  request.session.userId = user.id;
  request.session.email = user.email;
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch((error) => {
      if (error instanceof OfficialServiceError) {
        return response.status(error.status).json({ message: error.message });
      }
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          message: request.path.startsWith("/api/official/")
            ? "请输入完整且格式正确的教大登录资料。"
            : "请输入有效邮箱，密码至少需要 10 个字符。"
        });
      }
      next(error);
    });
  };
}
