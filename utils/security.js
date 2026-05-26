const crypto = require("crypto");
const config = require("../config");

const PASSWORD_ITERATIONS = 310000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input) {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

// Store passwords as salted PBKDF2 hashes instead of plain text.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");

  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

// Used during login to compare the submitted password with the stored hash.
function verifyPassword(password, storedHash) {
  const [scheme, iterationsValue, salt, expectedHash] = String(storedHash || "").split("$");

  if (scheme !== "pbkdf2" || !iterationsValue || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(iterationsValue);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");

  return timingSafeEqual(actualHash, expectedHash);
}

// Minimal HS256 JWT implementation using Node's built-in crypto module.
function signJwt(payload, expiresInSeconds = config.jwtExpiresInSeconds) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(unsignedToken)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsignedToken}.${signature}`;
}

// Verifies token signature and expiry before protected API routes can run.
function verifyJwt(token) {
  const parts = String(token || "").split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid authentication token.");
  }

  const [encodedHeader, encodedClaims, signature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;
  const expectedSignature = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(unsignedToken)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Error("Invalid authentication token.");
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader));
  const claims = JSON.parse(base64UrlDecode(encodedClaims));

  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Unsupported authentication token.");
  }

  if (!claims.exp || Math.floor(Date.now() / 1000) >= claims.exp) {
    throw new Error("Authentication token has expired.");
  }

  return claims;
}

function createSafeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  createSafeUser
};
