if (!globalThis.__eduhkVisaHelperLoaded) {
  globalThis.__eduhkVisaHelperLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "READ_IMMD_DETAIL") {
      return false;
    }

    readImmdDetail().then(sendResponse);
    return true;
  });
}

async function readImmdDetail() {
  const apiUrl = "https://pappl.eduhk.hk/vmsa/api/applicant/immd/detail";
  const token = findXsrfToken();
  const headers = {
    accept: "application/json, text/plain, */*",
    "cache-control": "no-cache",
    pragma: "no-cache"
  };

  if (token) {
    headers["x-xsrf-token"] = token;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store",
      referrer: "https://pappl.eduhk.hk/VMS/admission/applicant"
    });

    const text = await response.text();
    let data = null;

    try {
      data = JSON.parse(text);
    } catch (_error) {
      // A login page or gateway error may be returned as HTML/text.
    }

    if (!response.ok) {
      return {
        ok: false,
        code:
          response.status === 401 || response.status === 403
            ? "AUTH_REQUIRED"
            : "HTTP_ERROR",
        status: response.status,
        message:
          response.status === 401 || response.status === 403
            ? "登录状态已失效，或官网拒绝了当前请求。请重新登录后再试。"
            : `官网接口返回错误（HTTP ${response.status}）。`,
        detail: data?.message || null
      };
    }

    if (!data || typeof data !== "object") {
      return {
        ok: false,
        code: "INVALID_RESPONSE",
        message: "接口返回的不是有效 JSON，登录可能已经失效。"
      };
    }

    return {
      ok: true,
      data,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: error?.message || "网络请求失败，请稍后重试。"
    };
  }
}

function findXsrfToken() {
  const cookiePairs = document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      return [
        separator === -1 ? part : part.slice(0, separator),
        separator === -1 ? "" : part.slice(separator + 1)
      ];
    });

  const preferredCookieNames = [
    "XSRF-TOKEN",
    "XSRF_TOKEN",
    "CSRF-TOKEN",
    "CSRF_TOKEN"
  ];

  for (const name of preferredCookieNames) {
    const match = cookiePairs.find(
      ([cookieName]) => cookieName.toLowerCase() === name.toLowerCase()
    );
    if (match?.[1]) return safeDecode(match[1]);
  }

  for (const storage of [localStorage, sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && /(xsrf|csrf)/i.test(key)) {
        const value = storage.getItem(key);
        if (value) return stripWrappingQuotes(safeDecode(value));
      }
    }
  }

  const metaToken = document.querySelector(
    'meta[name="csrf-token"], meta[name="xsrf-token"]'
  )?.content;

  return metaToken || "";
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function stripWrappingQuotes(value) {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}
