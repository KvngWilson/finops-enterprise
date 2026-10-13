import { join } from "node:path";
import { JsonStore } from "./json-store.js";
import { validateRows } from "../domain/integrity.js";
export function createRepositories(directory) {
  function entity(kind, key) {
    const store = new JsonStore(join(directory, `${kind}.json`), (data) =>
      validateRows(kind, data),
    );
    return {
      findAll: () => store.read(),
      findById: async (id) => (await store.read()).find((r) => r[key] === id),
      insert: async (record, validate = () => {}) => {
        await store.update(async (rows) => {
          await validate(rows);
          return [...rows, record];
        });
        return record;
      },
      update: async (id, change) => {
        let updated;
        await store.update(async (rows) => {
          const index = rows.findIndex((r) => r[key] === id);
          updated = await change(rows[index]);
          return rows.map((r, i) => (i === index ? updated : r));
        });
        return updated;
      },
    };
  }
  return {
    clients: entity("clients", "clientId"),
    accounts: entity("accounts", "accountId"),
    transactions: {
      findAll: entity("transactions", "transactionId").findAll,
      findById: entity("transactions", "transactionId").findById,
    },
  };
}
