const elements = {
  authView: document.querySelector("#authView"),
  portalView: document.querySelector("#portalView"),
  userMenu: document.querySelector("#userMenu"),
  privacyBadge: document.querySelector("#privacyBadge"),
  userEmail: document.querySelector("#userEmail"),
  logoutButton: document.querySelector("#logoutButton"),
  loginTab: document.querySelector("#loginTab"),
  registerTab: document.querySelector("#registerTab"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  authNotice: document.querySelector("#authNotice"),
  guidePanel: document.querySelector("#guidePanel"),
  connectionPanel: document.querySelector("#connectionPanel"),
  resultPanel: document.querySelector("#resultPanel"),
  createQueryButton: document.querySelector("#createQueryButton"),
  connectionCode: document.querySelector("#connectionCode"),
  copyConnectionButton: document.querySelector("#copyConnectionButton"),
  expiryText: document.querySelector("#expiryText"),
  queryNotice: document.querySelector("#queryNotice"),
  newQueryButton: document.querySelector("#newQueryButton"),
  copyVisaNumberButton: document.querySelector("#copyVisaNumberButton"),
  portalImmdRefNo: document.querySelector("#portalImmdRefNo"),
  portalReferenceHelp: document.querySelector("#portalReferenceHelp"),
  portalName: document.querySelector("#portalName"),
  portalEnglishName: document.querySelector("#portalEnglishName"),
  portalApplicantNo: document.querySelector("#portalApplicantNo"),
  portalTerm: document.querySelector("#portalTerm"),
  portalDob: document.querySelector("#portalDob"),
  portalTravelDocument: document.querySelector("#portalTravelDocument")
};

let pollTimer = null;
let expiryTimer = null;
let currentVisaNumber = "";

elements.loginTab.addEventListener("click", () => selectAuthTab("login"));
elements.registerTab.addEventListener("click", () => selectAuthTab("register"));
elements.loginForm.addEventListener("submit", (event) => submitAuth(event, "login"));
elements.registerForm.addEventListener("submit", (event) => submitAuth(event, "register"));
elements.logoutButton.addEventListener("click", logout);
elements.createQueryButton.addEventListener("click", createQuery);
elements.copyConnectionButton.addEventListener("click", () =>
  copyText(elements.connectionCode.value, elements.copyConnectionButton)
);
elements.newQueryButton.addEventListener("click", resetQuery);
elements.copyVisaNumberButton.addEventListener("click", () =>
  copyText(currentVisaNumber, elements.copyVisaNumberButton)
);

initialize();

async function initialize() {
  try {
    const session = await api("/api/me");
    elements.registerTab.hidden = !session.allowRegistration;
    if (session.authenticated) showPortal(session.user);
    else showAuth();
  } catch (_error) {
    showAuth();
    elements.authNotice.textContent = "暂时无法连接服务器，请稍后刷新页面。";
  }
}

function selectAuthTab(tab) {
  const isLogin = tab === "login";
  elements.loginTab.classList.toggle("active", isLogin);
  elements.registerTab.classList.toggle("active", !isLogin);
  elements.loginForm.hidden = !isLogin;
  elements.registerForm.hidden = isLogin;
  elements.authNotice.textContent = "";
}

async function submitAuth(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  elements.authNotice.textContent = "正在处理…";

  try {
    const result = await api(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(data)
    });
    form.reset();
    elements.authNotice.textContent = "";
    showPortal(result.user);
  } catch (error) {
    elements.authNotice.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => null);
  stopTimers();
  resetQuery();
  showAuth();
}

async function createQuery() {
  elements.createQueryButton.disabled = true;

  try {
    const result = await api("/api/query-requests", { method: "POST" });
    elements.connectionCode.value = result.connectionCode;
    elements.guidePanel.hidden = true;
    elements.resultPanel.hidden = true;
    elements.connectionPanel.hidden = false;
    elements.queryNotice.textContent = "";
    startExpiryCountdown(result.expiresAt);
    startPolling(result.requestId);
  } catch (error) {
    elements.queryNotice.textContent = error.message;
  } finally {
    elements.createQueryButton.disabled = false;
  }
}

function startPolling(requestId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const result = await api(`/api/query-requests/${requestId}`);
      if (result.state !== "ready") return;

      stopTimers();
      renderResult(result.data);
      elements.connectionPanel.hidden = true;
      elements.resultPanel.hidden = false;
      await api(`/api/query-requests/${requestId}`, { method: "DELETE" }).catch(() => null);
    } catch (error) {
      if (error.status === 410 || error.status === 404) {
        stopTimers();
        elements.queryNotice.textContent = error.message;
      }
    }
  }, 1800);
}

function startExpiryCountdown(expiresAt) {
  clearInterval(expiryTimer);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, "0");
    elements.expiryText.textContent = seconds
      ? `连接码将在 ${minutes}:${remainder} 后失效`
      : "连接码已失效，请重新开始查询";
  };
  update();
  expiryTimer = setInterval(update, 1000);
}

function renderResult(data) {
  const master = data.masterDetail || {};
  const applicant = data.applicantDetail || {};
  currentVisaNumber = displayValue(master.immdRefNo);

  elements.portalImmdRefNo.textContent = currentVisaNumber;
  elements.portalReferenceHelp.textContent = String(master.immdRefNo || "")
    .toUpperCase()
    .startsWith("MEEN-")
    ? "MEEN 开头的是入境处申请档案编号。电子签证签发后，可用它在入境处官网下载。"
    : "这是入境处申请档案编号。电子签证签发后，可用它在入境处官网下载。";
  elements.portalName.textContent = displayValue(
    applicant.chineseName || master.traditionalChineseName
  );
  elements.portalEnglishName.textContent = displayValue(applicant.englishName);
  elements.portalApplicantNo.textContent = displayValue(applicant.applicantNo);
  elements.portalTerm.textContent = formatTerm(master.termCode);
  elements.portalDob.textContent = formatDate(applicant.dob);
  elements.portalTravelDocument.textContent = displayValue(master.eepNo || applicant.passport);
}

function showAuth() {
  elements.authView.hidden = false;
  elements.portalView.hidden = true;
  elements.userMenu.hidden = true;
  elements.privacyBadge.hidden = false;
}

function showPortal(user) {
  elements.authView.hidden = true;
  elements.portalView.hidden = false;
  elements.userMenu.hidden = false;
  elements.privacyBadge.hidden = true;
  elements.userEmail.textContent = user.email;
}

function resetQuery() {
  stopTimers();
  elements.guidePanel.hidden = false;
  elements.connectionPanel.hidden = true;
  elements.resultPanel.hidden = true;
  elements.connectionCode.value = "";
  elements.queryNotice.textContent = "";
  currentVisaNumber = "";
}

function stopTimers() {
  clearInterval(pollTimer);
  clearInterval(expiryTimer);
  pollTimer = null;
  expiryTimer = null;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || "请求失败，请稍后重试。");
    error.status = response.status;
    throw error;
  }
  return result;
}

async function copyText(value, button) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  const original = button.textContent;
  button.textContent = "已复制";
  setTimeout(() => (button.textContent = original), 1300);
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatTerm(value) {
  const text = String(value || "");
  return /^\d{6}$/.test(text)
    ? `${text.slice(0, 4)} 年 ${Number(text.slice(4))} 月入学`
    : displayValue(value);
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match
    ? `${match[3]} 年 ${Number(match[1])} 月 ${Number(match[2])} 日`
    : displayValue(value);
}
