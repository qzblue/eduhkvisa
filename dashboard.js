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
  referenceExplanation: document.querySelector("#referenceExplanation"),
  immdRefNo: document.querySelector("#immdRefNo"),
  masterFields: document.querySelector("#masterFields"),
  applicantFields: document.querySelector("#applicantFields"),
  lastUpdated: document.querySelector("#lastUpdated"),
  evisaMessage: document.querySelector("#evisaMessage"),
  pairingInput: document.querySelector("#pairingInput"),
  syncButton: document.querySelector("#syncButton"),
  syncNotice: document.querySelector("#syncNotice")
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
elements.syncButton.addEventListener("click", syncToPortal);

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
  elements.referenceExplanation.textContent = String(master.immdRefNo || "")
    .toUpperCase()
    .startsWith("MEEN-")
    ? "这个 MEEN 编号是入境处申请档案编号。电子签证签发后，你需要使用它到入境处官网查询和下载。"
    : "这是教大系统返回的入境处申请档案编号。电子签证签发后，可使用它到入境处官网查询和下载。";
  elements.lastUpdated.textContent = `本次读取：${formatDateTime(fetchedAt)}`;
  elements.evisaMessage.textContent =
    "申请获批并完成缴费（如适用）后，请进入香港入境处官方网站查询并下载。";

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

async function syncToPortal() {
  if (!currentData) {
    setSyncNotice("请先查询教大签证资料。", true);
    return;
  }

  let connection;
  try {
    connection = parseConnectionCode(elements.pairingInput.value);
  } catch (error) {
    setSyncNotice(error.message, true);
    return;
  }

  elements.syncButton.disabled = true;
  setSyncNotice("正在安全连接你的签证中心页面…", false);

  try {
    const permission = { origins: [`${connection.origin}/*`] };
    const granted = await chrome.permissions.request(permission);
    if (!granted) {
      throw new Error("你没有允许插件连接该网站，请重新点击并选择允许。");
    }

    const response = await fetch(`${connection.origin}/api/bridge/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingCode: connection.pairingCode,
        data: buildPortalPayload(currentData)
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "连接码无效或已经过期，请回到网站重新生成。");
    }

    setSyncNotice("发送成功！现在回到签证中心网站，资料会自动显示。", false);
    elements.pairingInput.value = "";
  } catch (error) {
    setSyncNotice(error.message || "发送失败，请检查连接码和网络后重试。", true);
  } finally {
    elements.syncButton.disabled = false;
  }
}

function parseConnectionCode(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) throw new Error("请粘贴网站生成的整条连接码。");

  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    throw new Error("连接码格式不正确，请从网站重新复制整条内容。");
  }

  const isSecure = url.protocol === "https:";
  const isLocalhost =
    url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!isSecure && !isLocalhost) {
    throw new Error("签证中心必须使用 HTTPS；本机测试可使用 localhost。");
  }

  const pairingCode = url.hash.slice(1);
  if (!pairingCode || !pairingCode.includes(".")) {
    throw new Error("连接码不完整，请从网站重新复制。");
  }

  return { origin: url.origin, pairingCode };
}

function buildPortalPayload(data) {
  const master = data.masterDetail || {};
  const applicant = data.applicantDetail || {};

  return {
    masterDetail: {
      aidm: master.aidm,
      termCode: master.termCode,
      submittedAt: master.submittedAt,
      verifiedAt: master.verifiedAt,
      rejectedAt: master.rejectedAt,
      immdRefNo: master.immdRefNo,
      traditionalChineseName: master.traditionalChineseName,
      maritalStatus: master.maritalStatus,
      eepNo: master.eepNo,
      pob: master.pob,
      remark: master.remark,
      needNOL: master.needNOL
    },
    applicantDetail: {
      applicantNo: applicant.applicantNo,
      englishName: applicant.englishName,
      chineseName: applicant.chineseName,
      mainlandId: applicant.mainlandId,
      passport: applicant.passport,
      nationality: applicant.nationality,
      nationalityName: applicant.nationalityName,
      dob: applicant.dob,
      visaType: applicant.visaType,
      visaDesc: applicant.visaDesc
    },
    documentSummary: {
      uploadedCount: Object.keys(data.uploadedDocuments || {}).length,
      requiredCount: (data.requiredDocuments || []).filter((item) => item.isRequired).length
    }
  };
}

function setSyncNotice(message, isError) {
  elements.syncNotice.textContent = message;
  elements.syncNotice.classList.toggle("error", Boolean(isError));
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
