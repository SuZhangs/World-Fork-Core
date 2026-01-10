import { createClient } from "../src/index.js";

const baseUrl = process.env.WORLDFORK_BASE_URL ?? "http://localhost:3000";
const apiKey = process.env.WF_API_KEY ?? process.env.WORLDFORK_API_KEY;

if (!apiKey) {
  throw new Error("Missing WF_API_KEY or WORLDFORK_API_KEY for SDK smoke test.");
}

const client = createClient({ baseUrl, apiKey });

const world = await client.createWorld({
  name: "SDK Smoke Test",
  description: "Temporary world from SDK smoke test"
});

await client.createBranch(world.id, {
  name: "smoke/branch",
  sourceBranch: "main"
});

const list = await client.listWorlds({ limit: 10 });

console.log("Smoke test world:", world.id);
console.log("World count:", list.items.length);
