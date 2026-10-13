export function createControllers(services) {
  const resource = (name) => ({
    list: async (req, res) => res.json(await services[name].list(req.query)),
    get: async (req, res) =>
      res.json({ data: await services[name].get(req.params.id) }),
    create: async (req, res) => {
      const data = await services[name].create(req.body);
      res
        .location(
          `/api/v1/${name}/${data.clientId && name === "clients" ? data.clientId : data.accountId}`,
        )
        .status(201)
        .json({ data });
    },
    update: async (req, res) =>
      res.json({ data: await services[name].update(req.params.id, req.body) }),
  });
  return {
    clients: resource("clients"),
    accounts: resource("accounts"),
    transactions: resource("transactions"),
    dashboard: async (req, res) =>
      res.json({ data: await services.dashboard.summary() }),
    health: (req, res) =>
      res.json({ status: "ok", timestamp: new Date().toISOString() }),
  };
}
