import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_TYPES = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  webp: "webp",
};

// The backend dir (…/backend), derived from this module's location so the
// uploads root is the SAME folder whether the server is launched from the repo
// root or from backend/. Previously this used process.cwd(), so a launch from
// the wrong directory served /api/uploads from a folder with no files (uploaded
// images 404'd even though they existed on disk).
const backendDir = path.resolve(fileURLToPath(import.meta.url), "../../..");

export const providerImageStorageRoot = (() => {
  const configured = process.env.IMAGE_STORAGE_DIR;
  if (configured && path.isAbsolute(configured)) return path.resolve(configured);
  // A relative IMAGE_STORAGE_DIR (e.g. "./uploads") or no value resolves
  // against the backend dir, not the volatile process working directory.
  return path.resolve(backendDir, configured || "uploads");
})();

export function parseImageDataUrl(value) {
  const match = String(value || "").trim().match(/^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length) return null;
  return { bytes, extension: IMAGE_TYPES[match[1].toLowerCase()] };
}

function safeSegment(value, fallback) {
  return String(value || "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || fallback;
}

export async function materializeImageReference(value, options = {}) {
  const reference = String(value || "").trim();
  if (!reference) return "";
  const parsed = parseImageDataUrl(reference);
  if (!parsed) return reference;

  const root = options.storageRoot || providerImageStorageRoot;
  const owner = safeSegment(options.ownerId, "unknown");
  const kind = safeSegment(options.kind, "image");
  const digest = crypto.createHash("sha256").update(parsed.bytes).digest("hex").slice(0, 20);
  const fileName = `${kind}-${digest}.${parsed.extension}`;
  const directory = path.join(root, "providers", owner);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), parsed.bytes, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  return `/api/uploads/providers/${owner}/${fileName}`;
}

export async function materializeProviderImages({ ownerId, businessImage = "", services = [], portfolio = [], teamMembers = [], storageRoot }) {
  const imageOptions = (kind) => ({ ownerId, kind, storageRoot });
  return {
    businessImage: await materializeImageReference(businessImage, imageOptions("cover")),
    services: await Promise.all(services.map(async (service, index) => ({
      ...service,
      image: await materializeImageReference(service?.image || service?.service_image, imageOptions(`service-${service?.id || index + 1}`)),
    }))),
    portfolio: await Promise.all(portfolio.map(async (item, index) => ({
      ...item,
      beforeImage: await materializeImageReference(item?.beforeImage || item?.before_image, imageOptions(`portfolio-${index + 1}-before`)),
      afterImage: await materializeImageReference(item?.afterImage || item?.after_image || item?.image, imageOptions(`portfolio-${index + 1}-after`)),
    }))),
    teamMembers: await Promise.all(teamMembers.map(async (member, index) => ({
      ...member,
      image: await materializeImageReference(member?.image, imageOptions(`team-${index + 1}`)),
    }))),
  };
}
