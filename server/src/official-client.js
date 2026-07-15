import { sanitizeVisaData } from "./sanitize.js";

const OFFICIAL_ORIGIN = "https://pappl.eduhk.hk";
const OFFICIAL_ENTRY = `${OFFICIAL_ORIGIN}/VMS/admission`;
const OFFICIAL_API = `${OFFICIAL_ORIGIN}/vmsa/api`;
const REQUEST_TIMEOUT_MS = 25_000;

const BROWSER_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
};

export class OfficialServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "OfficialServiceError";
    this.status = status;
  }
}

export async function fetchAdmissionTerms() {
  const context = await createRequestContext();
  const response = await officialApiRequest(context, "/option/termCode");
  const data = await readJson(response);

  if (!response.ok || !Array.isArray(data)) {
    throw new OfficialServiceError("暂时无法读取教大入学学期，请稍后重试。");
  }

  return data
    .filter((item) => /^\d{6}$/.test(String(item?.code || "")))
    .slice(0, 20)
    .map((item) => ({
      code: String(item.code),
      description: String(item.description || item.code).slice(0, 120)
    }));
}

export async function queryOfficialVisa(credentials) {
  // context 仅存在于这次函数调用中。请求结束后，官网 Cookie 随即等待垃圾回收，
  // 不写数据库、文件、日志或网站 session。
  const context = await createRequestContext();

  const loginResponse = await officialApiRequest(context, "/login/non-eduhk", {
    method: "POST",
    body: JSON.stringify(credentials)
  });
  const loginData = await readJson(loginResponse);

  if (!loginResponse.ok) {
    throw mapLoginError(loginResponse.status, loginData);
  }

  if (loginData?.role && loginData.role !== "APPLICANT") {
    throw new OfficialServiceError("该资料目前不能进入学生签证申请页面。", 403);
  }

  const detailResponse = await officialApiRequest(context, "/applicant/immd/detail");
  const detail = await readJson(detailResponse);

  if (!detailResponse.ok) {
    if ([401, 403].includes(detailResponse.status)) {
      throw new OfficialServiceError("教大登录未成功或会话已经失效，请检查资料后重试。", 401);
    }
    throw new OfficialServiceError("已登录教大，但暂时无法读取签证资料。请稍后重试。");
  }

  return sanitizeVisaData(detail);
}

async function createRequestContext() {
  let response;
  try {
    response = await fetch(OFFICIAL_ENTRY, {
      headers: {
        ...BROWSER_HEADERS,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (_error) {
    throw new OfficialServiceError("无法连接教大官网，请稍后重试。");
  }

  if (!response.ok) {
    throw new OfficialServiceError(`教大官网暂时不可用（HTTP ${response.status}）。`);
  }

  const html = await response.text();
  const token = html.match(/token:\s*["']([^"']+)["']/)?.[1];
  const cookies = new Map();
  updateCookies(cookies, response.headers);

  if (!token) {
    throw new OfficialServiceError("未能建立教大安全会话，请稍后重试。");
  }

  return { token, cookies };
}

async function officialApiRequest(context, path, options = {}) {
  const headers = {
    ...BROWSER_HEADERS,
    "x-xsrf-token": context.token,
    origin: OFFICIAL_ORIGIN,
    referer: OFFICIAL_ENTRY,
    cookie: serializeCookies(context.cookies),
    ...(options.headers || {})
  };

  if (options.body) headers["content-type"] = "application/json";

  let response;
  try {
    response = await fetch(`${OFFICIAL_API}${path}`, {
      ...options,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    // 教大网关在部分无效登录请求中会直接返回非标准错误页。
    if (String(error?.cause?.data || "").includes("can't be found")) {
      throw new OfficialServiceError("登录资料不正确，或该申请目前不允许登录。", 401);
    }
    throw new OfficialServiceError("连接教大官网时发生网络错误，请稍后重试。");
  }

  updateCookies(context.cookies, response.headers);
  const refreshedToken = context.cookies.get("XSRF-TOKEN");
  if (refreshedToken) context.token = decodeURIComponent(refreshedToken);
  return response;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function updateCookies(jar, headers) {
  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitCombinedSetCookie(headers.get("set-cookie") || "");

  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const cookieValue = pair.slice(separator + 1).trim();
    if (cookieValue) jar.set(name, cookieValue);
    else jar.delete(name);
  }
}

function splitCombinedSetCookie(value) {
  return value ? value.split(/,(?=\s*[^;,=]+=[^;,]*)/) : [];
}

function serializeCookies(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function mapLoginError(status, data) {
  const messages = {
    401: "登录资料不正确，请检查申请编号、身份证明号码和出生日期。",
    403: "该申请目前不允许登录教大签证系统。",
    404: "教大系统找不到这份申请资料。",
    409: "该申请目前尚未获邀进行签证验证。",
    410: "该申请目前尚未获邀进行签证验证。",
    423: "该申请目前暂时不能登录。"
  };
  const officialMessage = typeof data?.message === "string" ? data.message.trim() : "";
  return new OfficialServiceError(
    messages[status] || officialMessage || `教大登录失败（HTTP ${status}）。`,
    [401, 403, 404, 409, 410, 423].includes(status) ? 400 : 502
  );
}
