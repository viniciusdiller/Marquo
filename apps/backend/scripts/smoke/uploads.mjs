// Run only against a disposable, seeded test environment. Exercises real Multer + Sharp + storage.
import assert from "node:assert/strict";
import sharp from "sharp";
import { API, call } from "./lib.mjs";

const login = await call("POST", "/auth/login", { email: "dono@salaodemo.com", password: "senha123" });
assert.equal(login.status, 200, "seeded owner can sign in");
const token = login.json.accessToken;
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#ffffff" } }).png().toBuffer();
async function upload(path, bytes = png, type = "image/png") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), "compatibility.png");
  return fetch(API + path, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
}

const logo = await upload("/tenants/me/logo");
assert.equal(logo.status, 201, "valid PNG logo is accepted");
const { logoUrl } = await logo.json();
const served = await fetch(API + logoUrl);
assert.equal(served.status, 200, "uploaded image is served");
assert.match(served.headers.get("content-type"), /image\/webp/, "upload is converted to WebP");
assert.ok((await served.arrayBuffer()).byteLength > 0);

const gallery = await upload("/tenants/me/gallery");
assert.equal(gallery.status, 201, "gallery upload is accepted");
const image = await gallery.json();
assert.ok(image.id && image.url);
assert.equal((await fetch(API + image.url)).status, 200);
assert.equal((await call("DELETE", `/tenants/me/gallery/${image.id}`, undefined, token)).status, 200);

assert.equal((await upload("/tenants/me/logo", Buffer.from("not an image"), "text/plain")).status, 400, "invalid formats remain rejected");
assert.equal((await upload("/tenants/me/logo", Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413, "5MB limit remains enforced");
assert.equal((await call("GET", "/tenants/me", undefined, token)).json.logoUrl, logoUrl, "rejected uploads preserve the existing logo");
assert.equal((await call("DELETE", "/tenants/me/logo", undefined, token)).status, 200);
console.log("Multipart logo/gallery uploads, WebP serving and upload rejection checks passed.");
