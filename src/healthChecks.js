import { callGemini } from "./gemini.js";
import { createGhostJwt } from "./ghostAuth.js";

export async function testGemini(config) {
  try {
    const prompt =
      'Return JSON only: {"ok": true, "source": "ghostAutoPublish-test"}';
    const text = await callGemini(prompt, config);
    if (typeof text !== "string" || !text.trim()) {
      return {
        ok: false,
        message: "Gemini returned an empty response."
      };
    }
    return {
      ok: true,
      message: "Gemini test succeeded."
    };
  } catch (err) {
    return {
      ok: false,
      message: `Gemini test failed: ${
        (err && err.message) || String(err)
      }`
    };
  }
}

export async function testGhost(config) {
  try {
    const jwt = createGhostJwt(config);
    const base = config.GHOST_ADMIN_API_URL.replace(/\/+$/, "");
    const url = `${base}/site/`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Ghost ${jwt}`
      }
    });

    if (!res.ok) {
      return {
        ok: false,
        message: `Ghost responded with ${res.status} ${res.statusText}`
      };
    }

    return {
      ok: true,
      message: "Ghost test succeeded."
    };
  } catch (err) {
    return {
      ok: false,
      message: `Ghost test failed: ${
        (err && err.message) || String(err)
      }`
    };
  }
}

