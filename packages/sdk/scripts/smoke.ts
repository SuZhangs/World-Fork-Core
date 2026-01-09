import { createClient } from "../src/index.js";

const baseUrl = process.env.WORLDFORK_BASE_URL ?? "http://localhost:3000";

const client = createClient({ baseUrl });

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
