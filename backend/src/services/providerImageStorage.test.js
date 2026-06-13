import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeImageReference, parseImageDataUrl } from "./providerImageStorage.js";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("rejects unsupported or malformed image data URLs", () => {
  assert.equal(parseImageDataUrl("data:image/svg+xml;base64,PHN2Zy8+"), null);
  assert.equal(parseImageDataUrl("javascript:alert(1)"), null);
});

test("materializes provider uploads as durable backend URLs", async () => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "queless-images-"));
  const url = await materializeImageReference(ONE_PIXEL_PNG, { ownerId: 42, kind: "cover", storageRoot });
  assert.match(url, /^\/api\/uploads\/providers\/42\/cover-[a-f0-9]{20}\.png$/);
  const stored = path.join(storageRoot, url.replace("/api/uploads/", ""));
  assert.ok((await fs.stat(stored)).size > 0);
});
