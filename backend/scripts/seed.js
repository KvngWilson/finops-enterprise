import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../src/config.js";
import {
  INDUSTRIES,
  ACCOUNT_TYPES,
  TRANSACTION_STATUSES,
} from "../src/domain/constants.js";
import { verifyDataset } from "../src/domain/integrity.js";
export function demoData() {
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const names = [
    "Maple Ridge Manufacturing",
    "Aurora Construction Group",
    "Northern Route Logistics",
    "Cedar Cloud Technologies",
    "Harbour Financial Partners",
    "Pinecrest Retail Group",
    "Summit Wholesale Supply",
    "Prairie Precision Works",
    "Atlantic Infrastructure",
    "Great Lakes Transport",
  ];
  const stamp = "2026-09-01T12:00:00.000Z";
  const clients = names.map((companyName, i) => ({
    clientId: uuid(i + 1),
    companyName,
    registrationNumber: `DEMO-REG-${String(i + 1).padStart(5, "0")}`,
    industry: INDUSTRIES[i % 7],
    country: i % 3 === 0 ? "United States" : "Canada",
    contactEmail: `operations${i + 1}@example.com`,
    contactPhone: `+1 555 010 ${String(i).padStart(4, "0")}`,
    status: i === 8 ? "Inactive" : i === 9 ? "Suspended" : "Active",
    createdAt: stamp,
    updatedAt: stamp,
  }));
  const accounts = Array.from({ length: 20 }, (_, i) => ({
    accountId: uuid(100 + i),
    clientId: clients[Math.floor(i / 2)].clientId,
    accountNumber: `SIM-DEMO-${String(i + 1).padStart(8, "0")}`,
    accountType: ACCOUNT_TYPES[i % 3],
    currency: i % 2 === 0 ? "CAD" : "USD",
    balanceMinor: (i + 1) * 1250075,
    status: i === 18 ? "Frozen" : i === 19 ? "Closed" : "Active",
    createdAt: stamp,
  }));
  const transactions = Array.from({ length: 50 }, (_, i) => {
    const source = accounts[i % 20];
    const destination = accounts[((i % 20) + 2) % 20];
    return {
      transactionId: uuid(200 + i),
      referenceNumber: `TXN-2026-${String(i + 1).padStart(6, "0")}`,
      sourceAccountId: source.accountId,
      destinationAccountId: destination.accountId,
      amountMinor: i % 5 === 0 ? 125000000 + i * 100 : 1250 + i * 3750,
      currency: source.currency,
      transactionType: "Transfer",
      status: TRANSACTION_STATUSES[i % 3],
      description: `Simulated supplier payment ${i + 1}`,
      createdAt: new Date(Date.UTC(2026, 8, 2 + i, 12, i % 60)).toISOString(),
    };
  });
  return { clients, accounts, transactions };
}
async function seed() {
  if (!process.argv.includes("--reset-demo"))
    throw new Error(
      "Seeding overwrites data. To explicitly reset the demo, run npm run seed -- --reset-demo.",
    );
  const data = demoData();
  verifyDataset(data, true);
  await mkdir(config.dataDirectory, { recursive: true });
  for (const [name, rows] of Object.entries(data))
    await writeFile(
      join(config.dataDirectory, `${name}.json`),
      JSON.stringify(rows, null, 2) + "\n",
    );
  console.log("Reset demonstration dataset:", verifyDataset(data, true));
}
if (import.meta.url === new URL(process.argv[1], "file:").href) await seed();
