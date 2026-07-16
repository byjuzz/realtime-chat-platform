import express from "express";

const app = express();
const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
