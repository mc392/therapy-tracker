#!/usr/bin/env node
/* Mints GroundWork Plus licences — comps, gifts, founding members, testers.
   See docs/monetisation.md §6.3 for why this exists and what it is (and is not) for.

   The private key NEVER goes in this repo. --keygen writes it outside the tree and patches
   only the PUBLIC key into index.html, because a public key cannot mint anything. That is the
   whole point: one person bypassing the gate in devtools is already possible and already
   accepted, but a key generator circulating so that anyone can is a different problem — and a
   symmetric secret embedded in the app would be exactly that.

   ECDSA P-256, not Ed25519: WebCrypto has had P-256 everywhere for years, while Ed25519 only
   reached Safari 17 and Chrome 137, and this has to verify in whatever browser a therapist
   already has.

   Usage
     node scripts/issue-licence.mjs --keygen [--key-file <path>]
     node scripts/issue-licence.mjs --kind founding --name "Charlotte Bloor" --forever
     node scripts/issue-licence.mjs --kind gift --name "A N Other" --months 12
*/
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const HTML = "TherapyTracker-web/index.html";
const MARKER = "/* GW-LICENCE-PUBKEY */";
const KINDS = ["founding", "comp", "gift", "beta", "support"];

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const keyFile = resolve(opt("key-file", `${homedir()}/.groundwork/licence-key.json`));
const die = (m) => { console.error(`\n  ${m}\n`); process.exit(1); };

const b64u = (buf) => Buffer.from(buf).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* ---------------------------------------------------------------- keygen */
if (flag("keygen")) {
  if (existsSync(keyFile) && !flag("force"))
    die(`${keyFile} already exists. Re-keying invalidates every licence already issued.\n  Pass --force if that is really what you want.`);

  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pubJwk = publicKey.export({ format: "jwk" });
  const privJwk = privateKey.export({ format: "jwk" });

  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, JSON.stringify({ note: "GroundWork Plus licence signing key — keep this private and backed up", privateJwk: privJwk }, null, 2) + "\n", { mode: 0o600 });

  const html = readFileSync(HTML, "utf8");
  if (!html.includes(MARKER)) die(`${HTML} no longer contains ${MARKER} — has the Plus block been renamed?`);
  const literal = `{kty:"EC",crv:"P-256",x:"${pubJwk.x}",y:"${pubJwk.y}",ext:true}`;
  const patched = html.replace(
    new RegExp(`const PLUS_PUBKEY=.*?; ${MARKER.replace(/[*/]/g, "\\$&")}`),
    `const PLUS_PUBKEY=${literal}; ${MARKER}`
  );
  if (patched === html) die("Could not patch PLUS_PUBKEY — the line has changed shape; do it by hand.");
  writeFileSync(HTML, patched);

  console.log(`\n  Private key written to ${keyFile} (mode 600).`);
  console.log("  BACK IT UP. It is not in the repo and it cannot be recovered — losing it means");
  console.log("  re-keying, which invalidates every licence already issued.\n");
  console.log(`  Public key patched into ${HTML}. Commit that; never commit the private key.\n`);
  process.exit(0);
}

/* ---------------------------------------------------------------- issue */
if (!existsSync(keyFile)) die(`No signing key at ${keyFile}. Run:  node scripts/issue-licence.mjs --keygen`);

const kind = opt("kind", "comp");
if (!KINDS.includes(kind)) die(`--kind must be one of: ${KINDS.join(", ")}`);

const name = opt("name");
if (!name) die(`--name is required. It is shown in the app as "Licensed to <name>", which is\n  most of what discourages a key being passed around.`);

let exp = null;
if (!flag("forever")) {
  const months = Number(opt("months", kind === "gift" ? 12 : kind === "beta" ? 6 : 12));
  if (!Number.isFinite(months) || months <= 0) die("--months must be a positive number");
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  exp = d.toISOString();
} else if (kind !== "founding" && kind !== "comp") {
  die(`--forever is only for --kind founding or comp. A perpetual ${kind} is a support\n  obligation with no end date and no way to revoke it (there is no revocation list).`);
}

const payload = { v: 1, k: kind, n: name, exp, id: randomUUID().slice(0, 8) };
const encoded = b64u(Buffer.from(JSON.stringify(payload), "utf8"));

const { privateJwk } = JSON.parse(readFileSync(keyFile, "utf8"));
const key = createPrivateKey({ key: privateJwk, format: "jwk" });
/* ieee-p1363 = raw r||s, which is what WebCrypto's ECDSA verify expects. Node's default is DER. */
const sig = sign("sha256", Buffer.from(encoded, "utf8"), { key, dsaEncoding: "ieee-p1363" });

console.log(`\n  ${kind} licence for ${name}`);
console.log(`  ${exp ? `expires ${exp.slice(0, 10)}` : "no expiry"} · id ${payload.id}\n`);
console.log(`${encoded}.${b64u(sig)}\n`);
console.log("  Record the id, name and expiry somewhere OUTSIDE this repo — it holds personal");
console.log("  data, and it is the only way to know later what you issued. There is no");
console.log("  revocation: expiry is the only lever.\n");
