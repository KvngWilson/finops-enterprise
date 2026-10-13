import "dotenv/config";
import { fileURLToPath } from "node:url";
export const config = {
  port: Number(process.env.PORT ?? 3000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  dataDirectory:
    process.env.DATA_DIR ?? fileURLToPath(new URL("../data/", import.meta.url)),
};
