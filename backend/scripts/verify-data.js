import { createRepositories } from "../src/repositories/index.js";
import { config } from "../src/config.js";
import { verifyDataset } from "../src/domain/integrity.js";
const repos = createRepositories(config.dataDirectory);
const [clients, accounts, transactions] = await Promise.all([
  repos.clients.findAll(),
  repos.accounts.findAll(),
  repos.transactions.findAll(),
]);
console.log(
  "Dataset verification passed:",
  verifyDataset({ clients, accounts, transactions }, true),
);
