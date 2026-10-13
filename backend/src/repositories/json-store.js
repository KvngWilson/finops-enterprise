import { readFile, open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { AppError } from "../domain/errors.js";
// Shared per-process queues: even separate store instances serialize the same path.
const queues = new Map();
export class JsonStore {
  constructor(path, validate = () => {}) {
    this.path = resolve(path);
    this.validate = validate;
  }
  async read() {
    try {
      const data = JSON.parse(await readFile(this.path, "utf8"));
      if (!Array.isArray(data)) throw new Error("Expected a JSON array.");
      this.validate(data);
      return data;
    } catch (cause) {
      throw new AppError(
        500,
        "STORAGE_ERROR",
        `Unable to read valid ${this.path.split("/").pop()} storage.`,
        undefined,
        { cause },
      );
    }
  }
  async update(change) {
    const previous = queues.get(this.path) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        // Read inside the queue; never recreate or reset missing/corrupt storage.
        const existing = await this.read();
        const next = await change(existing);
        if (!Array.isArray(next))
          throw new AppError(
            500,
            "STORAGE_ERROR",
            "Storage update must produce an array.",
          );
        this.validate(next);
        const temporary = `${this.path}.${randomUUID()}.tmp`;
        let handle;
        try {
          handle = await open(temporary, "wx", 0o600);
          await handle.writeFile(JSON.stringify(next, null, 2) + "\n", "utf8");
          await handle.sync();
          await handle.close();
          handle = undefined;
          await rename(temporary, this.path);
        } catch (cause) {
          throw new AppError(
            500,
            "STORAGE_ERROR",
            "Unable to persist data; the original dataset was not intentionally replaced.",
          );
        } finally {
          if (handle) await handle.close().catch(() => {});
          await unlink(temporary).catch(() => {});
        }
        return next;
      });
    queues.set(this.path, operation);
    try {
      return await operation;
    } finally {
      if (queues.get(this.path) === operation) queues.delete(this.path);
    }
  }
}
