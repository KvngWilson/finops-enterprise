import { createApp } from "./app.js";
import { config } from "./config.js";
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const server = createApp().listen(config.port, () =>
  console.log(`FinOps API listening on http://localhost:${config.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
