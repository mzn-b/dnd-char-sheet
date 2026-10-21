import express, { type ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { migrate } from "./db.js";
import { characters } from "./routes/characters.js";
import { homebrew } from "./routes/homebrew.js";
import { content } from "./routes/content.js";
import { sources } from "./routes/sources.js";
import { HttpError } from "./content/http.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => void res.json({ ok: true }));
app.use("/api/characters", characters);
app.use("/api/homebrew", homebrew);
app.use("/api", content);
app.use("/api/sources", sources);
app.use("/api", (_req, _res) => {
  throw new HttpError(404, "Not found");
});

// In production the API also serves the built web client (single-page app).
const webDist = process.env.WEB_DIST && resolve(process.env.WEB_DIST);
if (webDist && existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
}

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? "Internal error" });
};
app.use(onError);

const port = Number(process.env.PORT ?? 4000);
await migrate();
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
