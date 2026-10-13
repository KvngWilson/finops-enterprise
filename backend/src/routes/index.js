import { Router } from "express";
import * as constants from "../domain/constants.js";
export function createRoutes(c) {
  const router = Router();
  router.get("/health", c.health);
  router.get("/metadata", (req, res) => res.json({ data: constants }));
  router.get("/dashboard/summary", c.dashboard);
  router.get("/clients", c.clients.list);
  router.post("/clients", c.clients.create);
  router.get("/clients/:id", c.clients.get);
  router.patch("/clients/:id", c.clients.update);
  router.get("/accounts", c.accounts.list);
  router.post("/accounts", c.accounts.create);
  router.get("/accounts/:id", c.accounts.get);
  router.get("/transactions", c.transactions.list);
  router.get("/transactions/:id", c.transactions.get);
  return router;
}
