import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../src/repo/prisma.js";

const tenantId =
  process.env.WORLDFORK_TENANT_ID ?? process.env.WF_TENANT_ID ?? process.argv[2];
const name = process.env.WORLDFORK_API_KEY_NAME ?? process.env.WF_API_KEY_NAME ?? process.argv[3];

if (!tenantId || !name) {
  console.error("Usage: tsx scripts/create-api-key.ts <tenantId> <name>");
  console.error("Or set WORLDFORK_TENANT_ID/WF_TENANT_ID and WORLDFORK_API_KEY_NAME/WF_API_KEY_NAME.");
  process.exit(1);
}

const apiKey = `wf_live_${randomBytes(24).toString("hex")}`;
const keyHash = createHash("sha256").update(apiKey).digest("hex");

try {
  await prisma.apiKey.create({
    data: {
      tenantId,
      name,
      keyHash
    }
  });

  console.log(`tenantId=${tenantId}`);
  console.log(`apiKey=${apiKey}`);
} finally {
  await prisma.$disconnect();
}
