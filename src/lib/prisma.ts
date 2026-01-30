import "dotenv/config";
import { PrismaPg } from "../../node_modules/@prisma/adapter-pg/dist/index.js";
import { PrismaClient } from "../../generated/prisma/client.js";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
