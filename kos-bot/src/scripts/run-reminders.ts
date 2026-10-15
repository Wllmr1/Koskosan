import { runRentCycle } from "../lib/jobs";
import { prisma } from "../lib/prisma";

runRentCycle()
  .then((r) => console.log(JSON.stringify(r)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
