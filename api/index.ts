import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

// ── CORS — handle manually so OPTIONS always returns 200 ──────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://package.curvetechsolution.online");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Preflight — must return 200 immediately
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

let initialized: Promise<void> | null = null;

async function init() {
  if (!initialized) {
    initialized = registerRoutes(httpServer, app).then(() => undefined);
  }
  return initialized;
}

export default async function handler(req: any, res: any) {
  await init();
  app(req, res);
}
