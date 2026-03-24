import { generateExcerptFromHtml } from "./validators.js";

export async function checkSlugCollision(slug, config, jwt) {
  const base = config.GHOST_ADMIN_API_URL.replace(/\/+$/, "");
  const url = `${base}/posts/?filter=slug:${encodeURIComponent(slug)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Ghost ${jwt}`
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Ghost API error while checking slug collision: ${res.status} ${res.statusText} – ${text.slice(
        0,
        300
      )}`
    );
  }

  const data = await res.json();
  const posts = (data && data.posts) || [];
  return posts.length > 0;
}

export async function resolveUniqueSlug(slug, config, jwt) {
  if (!(await checkSlugCollision(slug, config, jwt))) {
    return { slug, collision: false };
  }

  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateSuffix = `${yyyy}${mm}${dd}`;

  const slugDate = `${slug}-${dateSuffix}`;
  if (!(await checkSlugCollision(slugDate, config, jwt))) {
    return { slug: slugDate, collision: true };
  }

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const tsSuffix = `${dateSuffix}${hh}${min}${ss}`;
  const slugTimestamp = `${slug}-${tsSuffix}`;

  return { slug: slugTimestamp, collision: true };
}

export async function publishPost(profile, post, config, jwtToken) {
  const audience = (profile && (profile.id || profile.label)) || "profile";
  const { title, slug, html, wordCount } = post;

  const { slug: uniqueSlug, collision } = await resolveUniqueSlug(
    slug,
    config,
    jwtToken
  );

  const base = config.GHOST_ADMIN_API_URL.replace(/\/+$/, "");
  const url = `${base}/posts/?source=html`;

  let tags = [];
  if (profile && typeof profile.tag === "string" && profile.tag.trim()) {
    tags = [{ name: profile.tag.trim() }];
  } else if (audience === "new_agent") {
    tags = [{ name: "New Agents" }];
  } else if (audience === "current_agent") {
    tags = [{ name: "Current Agents" }];
  }

  const customExcerpt = generateExcerptFromHtml(html);

  const body = {
    posts: [
      {
        title,
        slug: uniqueSlug,
        html,
        status: "published",
        tags,
        custom_excerpt: customExcerpt
      }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Ghost ${jwtToken}`
    },
    body: JSON.stringify(body)
  });

  const httpStatus = res.status;
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(
      `Ghost API error while publishing ${audience} post: ${httpStatus} ${res.statusText} – ${text.slice(
        0,
        300
      )}`
    );
  }

  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  return {
    audience,
    slug,
    uniqueSlug,
    collision,
    httpStatus,
    wordCount,
    ghostResponse: json
  };
}
