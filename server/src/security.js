import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N: 16384,
    r: 8,
    p: 1
  });

  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("base64url")}`;
}

export async function verifyPassword(password, storedValue) {
  const [algorithm, salt, encodedKey] = String(storedValue || "").split("$");
  if (algorithm !== "scrypt" || !salt || !encodedKey) return false;

  const expected = Buffer.from(encodedKey, "base64url");
  const actual = Buffer.from(
    await scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1 })
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createPairingSecret() {
  return randomBytes(24).toString("base64url");
}

export function hashPairingSecret(secret, pepper) {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}
