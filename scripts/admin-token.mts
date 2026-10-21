// Prints a new admin API token and its SHA-256 hash.
//   ADMIN_API_TOKEN       goes in .env.local on the laptop (never in Railway)
//   ADMIN_API_TOKEN_HASH  goes in Railway's variables and in .env.local for the local server
import { createHash, randomBytes } from "node:crypto";

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token, "utf8").digest("hex");
console.log(`ADMIN_API_TOKEN=${token}`);
console.log(`ADMIN_API_TOKEN_HASH=${hash}`);
