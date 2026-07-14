import test from "node:test";
import assert from "node:assert/strict";
import {
  createPairingSecret,
  hashPairingSecret,
  hashPassword,
  verifyPassword
} from "../src/security.js";
import { sanitizeVisaData } from "../src/sanitize.js";

test("password hashes can be verified without storing the password", async () => {
  const hash = await hashPassword("a-long-test-password");
  assert.equal(await verifyPassword("a-long-test-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(hash.includes("a-long-test-password"), false);
});

test("pairing secrets are random and keyed before database storage", () => {
  const first = createPairingSecret();
  const second = createPairingSecret();
  assert.notEqual(first, second);
  assert.equal(hashPairingSecret(first, "x".repeat(32)).length, 64);
});

test("visa payload removes application status and uploaded documents", () => {
  const sanitized = sanitizeVisaData({
    masterDetail: {
      immdRefNo: "MEEN-0000000-00",
      status: "SHOULD_NOT_LEAVE_BROWSER",
      eepNo: "TEST1234"
    },
    applicantDetail: { applicantNo: "A00000000", chineseName: "测试学生" },
    uploadedDocuments: { secret: { fileUrl: "https://example.invalid/private" } },
    documentSummary: { uploadedCount: 3, requiredCount: 2 }
  });

  assert.equal(sanitized.masterDetail.immdRefNo, "MEEN-0000000-00");
  assert.equal("status" in sanitized.masterDetail, false);
  assert.equal("uploadedDocuments" in sanitized, false);
  assert.deepEqual(sanitized.documentSummary, { uploadedCount: 3, requiredCount: 2 });
});
