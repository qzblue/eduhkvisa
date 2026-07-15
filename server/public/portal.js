document.documentElement.classList.add("js");

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
  guideNotice: document.querySelector("#guideNotice"),
  queryingPanel: document.querySelector("#queryingPanel"),
  resultPanel: document.querySelector("#resultPanel"),
  officialLoginForm: document.querySelector("#officialLoginForm"),
  admissionTerm: document.querySelector("#admissionTerm"),
  createQueryButton: document.querySelector("#createQueryButton"),
  backToGuideButton: document.querySelector("#backToGuideButton"),
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

let currentVisaNumber = "";

elements.loginTab.addEventListener("click", () => selectAuthTab("login"));
elements.registerTab.addEventListener("click", () => selectAuthTab("register"));
elements.loginForm.addEventListener("submit", (event) => submitAuth(event, "login"));
elements.registerForm.addEventListener("submit", (event) => submitAuth(event, "register"));
elements.logoutButton.addEventListener("click", logout);
elements.officialLoginForm.addEventListener("submit", queryVisaDetail);
elements.backToGuideButton.addEventListener("click", resetQuery);
elements.newQueryButton.addEventListener("click", resetQuery);
elements.copyVisaNumberButton.addEventListener("click", () =>
  copyText(currentVisaNumber, elements.copyVisaNumberButton)
);

initialize();
setupRevealMotion();

async function initialize() {
  try {
    const session = await api("/api/me");
    elements.registerTab.hidden = !session.allowRegistration;
    if (session.authenticated) {
      showPortal(session.user);
      await loadAdmissionTerms();
    } else {
      showAuth();
    }
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
    await loadAdmissionTerms();
  } catch (error) {
    elements.authNotice.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => null);
  resetQuery();
  elements.officialLoginForm.reset();
  showAuth();
}

async function loadAdmissionTerms() {
  elements.admissionTerm.disabled = true;
  elements.admissionTerm.innerHTML = '<option value="">正在读取教大可用学期…</option>';

  try {
    const result = await api("/api/official/terms");
    elements.admissionTerm.innerHTML = '<option value="">请选择入学学期</option>';
    for (const term of result.terms || []) {
      const option = document.createElement("option");
      option.value = term.code;
      option.textContent = `${formatTerm(term.code)} · ${term.description}`;
      elements.admissionTerm.append(option);
    }
    elements.admissionTerm.disabled = false;
  } catch (error) {
    elements.admissionTerm.innerHTML = '<option value="">读取失败，请刷新页面重试</option>';
    elements.guideNotice.textContent = error.message;
  }
}

async function queryVisaDetail(event) {
  event.preventDefault();
  elements.guideNotice.textContent = "";
  elements.queryNotice.textContent = "";

  const formData = new FormData(elements.officialLoginForm);
  const dob = toOfficialDate(formData.get("dob"));
  const payload = {
    applicantNo: String(formData.get("applicantNo") || "").trim(),
    idType: String(formData.get("idType") || ""),
    id: String(formData.get("id") || "").trim(),
    dob,
    admissionTerm: String(formData.get("admissionTerm") || "")
  };

  if (!dob) {
    elements.guideNotice.textContent = "请选择正确的出生日期。";
    return;
  }

  elements.createQueryButton.disabled = true;
  elements.guidePanel.hidden = true;
  elements.resultPanel.hidden = true;
  elements.queryingPanel.hidden = false;

  try {
    const result = await api("/api/official/query", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderResult(result.data);
    elements.queryingPanel.hidden = true;
    elements.resultPanel.hidden = false;
    // 成功后立即从网页表单清除完整身份证明号码。
    elements.officialLoginForm.elements.id.value = "";
  } catch (error) {
    elements.queryNotice.textContent = error.message;
  } finally {
    elements.createQueryButton.disabled = false;
  }
}

function renderResult(data) {
  const master = data?.masterDetail || {};
  const applicant = data?.applicantDetail || {};
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
  elements.guidePanel.hidden = false;
  elements.queryingPanel.hidden = true;
  elements.resultPanel.hidden = true;
  elements.queryNotice.textContent = "";
  elements.guideNotice.textContent = "";
  currentVisaNumber = "";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "请求失败，请稍后重试。");
  return result;
}

async function copyText(value, button) {
  if (!value || value === "—") return;
  await navigator.clipboard.writeText(value);
  const original = button.textContent;
  button.textContent = "已复制";
  setTimeout(() => (button.textContent = original), 1300);
}

function toOfficialDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
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

function setupRevealMotion() {
  const sections = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.08, rootMargin: "0px 0px -5%" }
  );

  sections.forEach((section) => observer.observe(section));
}
