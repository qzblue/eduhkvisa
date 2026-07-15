import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/security.js";
import { sanitizeVisaData } from "../src/sanitize.js";

test("password hashes can be verified without storing the password", async () => {
  const hash = await hashPassword("a-long-test-password");
  assert.equal(await verifyPassword("a-long-test-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(hash.includes("a-long-test-password"), false);
});

test("visa response only keeps allowed fields", () => {
  const result = sanitizeVisaData({
    masterDetail: {
      immdRefNo: "MEEN-0000000-00",
      termCode: "202609",
      status: "MUST_NOT_BE_RETURNED"
    },
    applicantDetail: {
      applicantNo: "A00000000",
      chineseName: "测试学生"
    },
    uploadedDocuments: { secret: { fileUrl: "https://example.invalid/private" } },
    requiredDocuments: [{ documentCode: "PRIVATE" }]
  });

  assert.equal(result.masterDetail.immdRefNo, "MEEN-0000000-00");
  assert.equal("status" in result.masterDetail, false);
  assert.equal("uploadedDocuments" in result, false);
  assert.equal("requiredDocuments" in result, false);
});
