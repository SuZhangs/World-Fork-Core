import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/server/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "openapi", "openapi.json");

const app = await buildApp();
await app.ready();

const openapi = app.swagger();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(openapi, null, 2));
await app.close();

console.log(`OpenAPI schema written to ${outputPath}`);
