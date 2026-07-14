const DASHBOARD_URL = chrome.runtime.getURL("index.html");
const LOGIN_URL =
  "https://pappl.eduhk.hk/VMS/admission/applicant/ImmD/submission";

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.filter((tab) => tab.url === DASHBOARD_URL);

  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: DASHBOARD_URL });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FETCH_VISA_DETAIL") {
    fetchVisaDetail().then(sendResponse);
    return true;
  }

  if (message?.type === "OPEN_LOGIN_PAGE") {
    openOrFocusLoginPage().then(sendResponse);
    return true;
  }

  return false;
});

async function findEduhkTab() {
  const tabs = await chrome.tabs.query({ url: "https://pappl.eduhk.hk/*" });

  return (
    tabs.find((tab) => tab.url?.includes("/ImmD/submission")) ||
    tabs.find((tab) => tab.url?.includes("/VMS/admission/applicant")) ||
    tabs[0] ||
    null
  );
}

async function openOrFocusLoginPage() {
  const tab = await findEduhkTab();

  if (tab?.id) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return { ok: true, reused: true };
  }

  await chrome.tabs.create({ url: LOGIN_URL });
  return { ok: true, reused: false };
}

async function sendToContentScript(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "READ_IMMD_DETAIL"
    });
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    return chrome.tabs.sendMessage(tabId, {
      type: "READ_IMMD_DETAIL"
    });
  }
}

async function fetchVisaDetail() {
  const tab = await findEduhkTab();

  if (!tab?.id) {
    return {
      ok: false,
      code: "LOGIN_PAGE_NOT_OPEN",
      message: "请先打开并登录香港教育大学申请系统。"
    };
  }

  try {
    const result = await sendToContentScript(tab.id);
    return result || {
      ok: false,
      code: "EMPTY_RESPONSE",
      message: "官网页面没有返回资料，请刷新官网页面后重试。"
    };
  } catch (error) {
    return {
      ok: false,
      code: "CONTENT_SCRIPT_ERROR",
      message: error?.message || "无法连接官网页面，请刷新后重试。"
    };
  }
}
