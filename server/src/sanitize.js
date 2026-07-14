const MASTER_FIELDS = [
  "aidm",
  "termCode",
  "submittedAt",
  "verifiedAt",
  "rejectedAt",
  "immdRefNo",
  "traditionalChineseName",
  "maritalStatus",
  "eepNo",
  "pob",
  "remark",
  "needNOL"
];

const APPLICANT_FIELDS = [
  "applicantNo",
  "englishName",
  "chineseName",
  "mainlandId",
  "passport",
  "nationality",
  "nationalityName",
  "dob",
  "visaType",
  "visaDesc"
];

export function sanitizeVisaData(input) {
  if (!input || typeof input !== "object") {
    throw new Error("签证资料格式不正确。");
  }

  const masterDetail = pickSafeFields(input.masterDetail, MASTER_FIELDS);
  const applicantDetail = pickSafeFields(input.applicantDetail, APPLICANT_FIELDS);
  const immdRefNo = String(masterDetail.immdRefNo || "").trim();

  if (!immdRefNo || immdRefNo.length > 80) {
    throw new Error("没有找到有效的入境处申请档案编号。");
  }

  masterDetail.immdRefNo = immdRefNo;

  return {
    masterDetail,
    applicantDetail,
    documentSummary: {
      uploadedCount: safeCount(input.documentSummary?.uploadedCount),
      requiredCount: safeCount(input.documentSummary?.requiredCount)
    }
  };
}

function pickSafeFields(source, fields) {
  const result = {};
  const object = source && typeof source === "object" ? source : {};

  for (const field of fields) {
    const value = object[field];
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      result[field] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }

  return result;
}

function safeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= 1000 ? count : 0;
}
