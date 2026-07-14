const views = {
  welcome: document.querySelector("#welcomeView"),
  loading: document.querySelector("#loadingView"),
  result: document.querySelector("#resultView")
};

const elements = {
  notice: document.querySelector("#notice"),
  queryButton: document.querySelector("#queryButton"),
  loginButton: document.querySelector("#loginButton"),
  refreshButton: document.querySelector("#refreshButton"),
  copyReferenceButton: document.querySelector("#copyReferenceButton"),
  immdRefNo: document.querySelector("#immdRefNo"),
  masterFields: document.querySelector("#masterFields"),
  applicantFields: document.querySelector("#applicantFields"),
  lastUpdated: document.querySelector("#lastUpdated"),
  evisaMessage: document.querySelector("#evisaMessage")
};

const maritalTranslations = {
  Married: "已婚",
  Single: "未婚",
  Divorced: "离婚",
  Widowed: "丧偶",
  Separated: "分居"
};

const countryTranslations = {
  CHN: "中国内地",
  HKG: "中国香港",
  MAC: "中国澳门",
  TWN: "中国台湾"
};

let currentData = null;

elements.queryButton.addEventListener("click", queryVisaDetail);
elements.refreshButton.addEventListener("click", queryVisaDetail);
elements.loginButton.addEventListener("click", openLoginPage);
elements.copyReferenceButton.addEventListener("click", () => {
  copyText(currentData?.masterDetail?.immdRefNo, elements.copyReferenceButton);
});

if (!isExtensionPage()) {
  showNotice(
    "当前是普通网页预览。浏览器安全策略不允许网页读取教大登录资料，请按 README 安装扩展后使用。"
  );
}

async function queryVisaDetail() {
  if (!isExtensionPage()) {
    showView("welcome");
    showNotice("请先把本项目加载为 Chrome／Edge 扩展，再从扩展图标打开本页查询。 ");
    return;
  }

  showView("loading");

  try {
    const result = await chrome.runtime.sendMessage({ type: "FETCH_VISA_DETAIL" });

    if (!result?.ok) {
      showView("welcome");
      showNotice(result?.message || "暂时无法读取资料，请稍后重试。 ");
      return;
    }

    currentData = result.data;
    renderResult(result.data, result.fetchedAt);
    showView("result");
  } catch (error) {
    showView("welcome");
    showNotice(error?.message || "扩展运行异常，请重新加载扩展后再试。 ");
  }
}

async function openLoginPage() {
  if (isExtensionPage()) {
    await chrome.runtime.sendMessage({ type: "OPEN_LOGIN_PAGE" });
    return;
  }

  window.open(
    "https://pappl.eduhk.hk/VMS/admission/applicant/ImmD/submission",
    "_blank",
    "noopener,noreferrer"
  );
}

function renderResult(data, fetchedAt) {
  const master = data.masterDetail || {};
  const applicant = data.applicantDetail || {};
  const uploadedCount = Object.keys(data.uploadedDocuments || {}).length;
  const requiredCount = (data.requiredDocuments || []).filter(
    (document) => document.isRequired
  ).length;

  elements.immdRefNo.textContent = displayValue(master.immdRefNo);
  elements.lastUpdated.textContent = `本次读取：${formatDateTime(fetchedAt)}`;
  elements.evisaMessage.textContent =
    "请进入香港入境处官方网站，使用上方签证编号查询并下载你的签证。";

  renderFields(elements.masterFields, [
    ["入学学期", formatTerm(master.termCode)],
    ["提交时间", formatDateTime(master.submittedAt)],
    ["资料核验时间", formatDateTime(master.verifiedAt)],
    ["最近退回时间", formatDateTime(master.rejectedAt)],
    ["系统记录编号", master.aidm],
    ["往来港澳通行证号码", master.eepNo],
    ["出生地点", translateCountry(master.pob)],
    ["婚姻状况", maritalTranslations[master.maritalStatus] || master.maritalStatus],
    ["是否需要不反对通知书", formatBoolean(master.needNOL)],
    ["已上传／必需文件", `${uploadedCount} 份／${requiredCount} 类`],
    ["备注", master.remark]
  ]);

  renderFields(elements.applicantFields, [
    ["申请编号", applicant.applicantNo],
    ["中文姓名", applicant.chineseName || master.traditionalChineseName],
    ["英文姓名", applicant.englishName],
    ["出生日期", formatDate(applicant.dob)],
    ["国籍／地区", applicant.nationalityName || translateCountry(applicant.nationality)],
    ["内地身份证号码", applicant.mainlandId],
    ["护照号码", applicant.passport],
    ["签证类别", formatVisaType(applicant.visaType, applicant.visaDesc)]
  ]);
}

function renderFields(container, fields) {
  container.replaceChildren();

  fields.forEach(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");

    row.className = "field-row";
    term.textContent = label;
    description.textContent = displayValue(value);
    row.append(term, description);
    container.append(row);
  });
}

function formatTerm(value) {
  const text = String(value || "");
  if (!/^\d{6}$/.test(text)) return value;
  return `${text.slice(0, 4)} 年 ${Number(text.slice(4))} 月`;
}

function formatDateTime(value) {
  if (!value) return "—";

  const normalized = String(value).includes("T")
    ? String(value)
    : String(value).replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDate(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return String(value);
  return `${match[3]} 年 ${Number(match[1])} 月 ${Number(match[2])} 日`;
}

function translateCountry(value) {
  return countryTranslations[value] || value;
}

function formatBoolean(value) {
  if (value === true) return "是";
  if (value === false) return "否";
  return value;
}

function formatVisaType(type, description) {
  if (!type && !description) return null;
  if (description === "STUDENT") return `${type || ""}（学生签证）`.trim();
  return [type, description].filter(Boolean).join(" · ");
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function showView(name) {
  Object.entries(views).forEach(([key, view]) => {
    view.hidden = key !== name;
  });
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.hidden = false;
}

function isExtensionPage() {
  return Boolean(globalThis.chrome?.runtime?.id);
}

async function copyText(value, button) {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(String(value));
    const original = button.textContent;
    button.textContent = "已复制";
    setTimeout(() => {
      button.textContent = original;
    }, 1400);
  } catch (_error) {
    button.textContent = "复制失败";
  }
}
