import { purgeChatMemory, purgeExpiredDocuments } from "../lib/jobs";
import { prisma } from "../lib/prisma";

purgeChatMemory()
  .then(async (memory) => {
    const documents = await purgeExpiredDocuments();
    console.log(JSON.stringify({ memory, documents }));
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
