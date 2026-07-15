const MASTER_FIELDS = [
  "termCode",
  "immdRefNo",
  "traditionalChineseName",
  "eepNo"
];

const APPLICANT_FIELDS = [
  "applicantNo",
  "englishName",
  "chineseName",
  "passport",
  "dob"
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
    applicantDetail
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
