import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3001);
const CURRENT_API_URL = "https://www.um.es/ws-siu/elecciones/elecciones_2026_2v.php";
const HISTORICAL_API_URL = "https://www.um.es/ws-siu/elecciones/elecciones_2026_1v.php";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

const app = express();

async function proxyElection(url, res) {
  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({
        message: "No se pudieron recuperar los datos del recuento."
      });
      return;
    }

    const data = await upstream.json();
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (error) {
    res.status(502).json({
      message: "Error consultando la API de la UM.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

app.get("/api/elections-2v", async (_req, res) => {
  await proxyElection(CURRENT_API_URL, res);
});

app.get("/api/elections-1v", async (_req, res) => {
  await proxyElection(HISTORICAL_API_URL, res);
});

app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }

  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error) {
      next();
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
