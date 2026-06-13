import express from "express";
import cors from "cors";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  "https://package.curvetechsolution.online",
  "https://invoice.curvetechsolution.online",
  "https://curvetechsolution.online",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now to debug
    }
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

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
