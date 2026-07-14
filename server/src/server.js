import crypto from "node:crypto";
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
import {
  createPairingSecret,
  hashPairingSecret,
  hashPassword,
  verifyPassword
} from "./security.js";
import { sanitizeVisaData } from "./sanitize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(__dirname, "../public");

const environment = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    PUBLIC_ORIGIN: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    PAIRING_PEPPER: z.string().min(32),
    ALLOW_REGISTRATION: z.string().default("true"),
    DATABASE_SSL: z.string().default("false")
  })
  .parse(process.env);

const publicOrigin = environment.PUBLIC_ORIGIN.replace(/\/$/, "");
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

const bridgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false
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

app.post(
  "/api/query-requests",
  requireSameOrigin,
  requireAuth,
  asyncHandler(async (request, response) => {
    const id = crypto.randomUUID();
    const secret = createPairingSecret();
    const tokenHash = hashPairingSecret(secret, environment.PAIRING_PEPPER);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO visa_query_requests(id, user_id, token_hash, expires_at)
       VALUES($1, $2, $3, $4)`,
      [id, request.session.userId, tokenHash, expiresAt]
    );

    response.status(201).json({
      ok: true,
      requestId: id,
      connectionCode: `${publicOrigin}/connect#${id}.${secret}`,
      expiresAt: expiresAt.toISOString()
    });
  })
);

app.get(
  "/api/query-requests/:id",
  requireAuth,
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT payload, expires_at, received_at
       FROM visa_query_requests
       WHERE id = $1 AND user_id = $2`,
      [request.params.id, request.session.userId]
    );
    const query = result.rows[0];

    if (!query) return response.status(404).json({ message: "没有找到这次查询。" });
    if (new Date(query.expires_at).getTime() <= Date.now()) {
      return response.status(410).json({ message: "连接码已经过期，请重新开始查询。" });
    }
    if (!query.payload) return response.json({ ok: true, state: "waiting" });

    await pool.query(
      "UPDATE visa_query_requests SET delivered_at = COALESCE(delivered_at, NOW()) WHERE id = $1",
      [request.params.id]
    );
    response.json({ ok: true, state: "ready", data: query.payload });
  })
);

app.delete(
  "/api/query-requests/:id",
  requireSameOrigin,
  requireAuth,
  asyncHandler(async (request, response) => {
    await pool.query("DELETE FROM visa_query_requests WHERE id = $1 AND user_id = $2", [
      request.params.id,
      request.session.userId
    ]);
    response.json({ ok: true });
  })
);

app.options("/api/bridge/submit", allowExtensionCors);
app.post(
  "/api/bridge/submit",
  bridgeLimiter,
  allowExtensionCors,
  asyncHandler(async (request, response) => {
    const pairingCode = String(request.body?.pairingCode || "");
    const separator = pairingCode.indexOf(".");
    if (separator <= 0) {
      return response.status(400).json({ message: "连接码格式不正确。" });
    }

    const id = pairingCode.slice(0, separator);
    const secret = pairingCode.slice(separator + 1);
    if (!z.string().uuid().safeParse(id).success || secret.length < 20) {
      return response.status(400).json({ message: "连接码格式不正确。" });
    }

    let payload;
    try {
      payload = sanitizeVisaData(request.body?.data);
    } catch (error) {
      return response.status(400).json({ message: error.message });
    }

    const tokenHash = hashPairingSecret(secret, environment.PAIRING_PEPPER);
    const result = await pool.query(
      `UPDATE visa_query_requests
       SET payload = $1::jsonb, received_at = NOW()
       WHERE id = $2
         AND token_hash = $3
         AND expires_at > NOW()
         AND payload IS NULL
       RETURNING id`,
      [JSON.stringify(payload), id, tokenHash]
    );

    if (result.rowCount !== 1) {
      return response
        .status(410)
        .json({ message: "连接码无效、已使用或已经过期，请在网站重新生成。" });
    }

    response.json({ ok: true });
  })
);

app.use(express.static(publicDirectory, { extensions: ["html"] }));
app.get(["/", "/connect"], (_request, response) => {
  response.sendFile(path.join(publicDirectory, "index.html"));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: "服务器暂时无法处理请求，请稍后再试。" });
});

const server = app.listen(environment.PORT, () => {
  console.log(`EduHK Visa Portal listening on port ${environment.PORT}`);
});

const cleanupTimer = setInterval(async () => {
  try {
    await pool.query(
      `DELETE FROM visa_query_requests
       WHERE expires_at < NOW() OR delivered_at < NOW() - INTERVAL '10 minutes'`
    );
  } catch (error) {
    console.error("Expired query cleanup failed", error);
  }
}, 60_000);
cleanupTimer.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    clearInterval(cleanupTimer);
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

function requireAuth(request, response, next) {
  if (!request.session.userId) {
    return response.status(401).json({ message: "请先登录签证中心。" });
  }
  next();
}

function requireSameOrigin(request, response, next) {
  const origin = request.get("origin");
  if (origin && origin !== publicOrigin) {
    return response.status(403).json({ message: "请求来源不被允许。" });
  }
  next();
}

function allowExtensionCors(request, response, next) {
  const origin = request.get("origin");
  if (origin?.startsWith("chrome-extension://")) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  } else if (origin) {
    return response.status(403).json({ message: "只允许从签证助手插件提交资料。" });
  }

  if (request.method === "OPTIONS") return response.sendStatus(204);
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
      if (error instanceof z.ZodError) {
        return response.status(400).json({
          message: "请输入有效邮箱，密码至少需要 10 个字符。"
        });
      }
      next(error);
    });
  };
}
