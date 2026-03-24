import jwt from "jsonwebtoken";

export function createGhostJwt(config) {
  const { keyId, secret, GHOST_ADMIN_API_URL } = config;

  if (!keyId || !secret) {
    throw new Error(
      "Ghost Admin keyId and secret are required to generate JWT."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 5 * 60;

  let aud = GHOST_ADMIN_API_URL;
  if (!aud.endsWith("/")) {
    aud += "/";
  }

  const payload = {
    iat: now,
    exp,
    aud
  };

  // Ghost Admin API secret is hex-encoded.
  const token = jwt.sign(payload, Buffer.from(secret, "hex"), {
    keyid: keyId,
    algorithm: "HS256"
  });

  return token;
}

