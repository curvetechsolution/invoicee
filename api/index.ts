import express from "express";
import cors from "cors";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.options("*", cors());

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
