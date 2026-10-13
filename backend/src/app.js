import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { createRepositories } from "./repositories/index.js";
import { createServices } from "./services/index.js";
import { createControllers } from "./controllers/index.js";
import { createRoutes } from "./routes/index.js";
export function createApp(options = {}) {
  const settings = { ...config, ...options };
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: settings.frontendOrigin }));
  app.use(express.json({ limit: "64kb" }));
  app.use(
    "/api/v1",
    createRoutes(
      createControllers(
        createServices(createRepositories(settings.dataDirectory)),
      ),
    ),
  );
  app.use((req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }),
  );
  app.use((err, req, res, next) => {
    const malformed = err.type === "entity.parse.failed";
    const status = malformed ? 400 : (err.status ?? 500);
    if (status >= 500)
      console.error(`[${err.code ?? "INTERNAL_ERROR"}] ${err.message}`);
    res
      .status(status)
      .json({
        error: {
          code: malformed ? "INVALID_JSON" : (err.code ?? "INTERNAL_ERROR"),
          message: malformed
            ? "Request body is not valid JSON."
            : status >= 500
              ? "Storage or server operation failed. Check the backend log and data files."
              : err.message,
          ...(err.fields ? { fields: err.fields } : {}),
        },
      });
  });
  return app;
}
