import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";
import { marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { QueryTypes } from "sequelize";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { empresas } from "./empresas.js";
import { getConnection, getEmpresa } from "./helpers/getConnection.js";
import { authAdmin } from "./middlewares/authAdmin.js";
import { authToken } from "./middlewares/authToken.js";
import { ultimos8, patronTelefono, coincideTelefono } from "./helpers/telefonos.js";
import planesRouter from "./routes/planes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
marked.use(gfmHeadingId());

const PORT = process.env.PORT || 3000;

// Rutas
// Muestra la documentación (README.md) como página web
app.get("/", async (req, res) => {
  try {
    const markdown = await readFile(join(__dirname, "README.md"), "utf-8");
    return res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API PLANES - Documentación </title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; line-height: 1.6; color: #1f2328; background: #fff; }
    h1, h2 { border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
    h2 { margin-top: 2em; }
    a { color: #0969da; }
    code { background: #f0f2f4; padding: .15em .35em; border-radius: 4px; font-size: 90%; }
    pre { background: #f6f8fa; padding: 14px 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; display: block; overflow-x: auto; }
    th, td { border: 1px solid #d0d7de; padding: 6px 12px; text-align: left; }
    th { background: #f6f8fa; }
    hr { border: 0; border-top: 1px solid #d0d7de; margin: 2em 0; }
  </style>
</head>
<body>
${marked.parse(markdown)}
</body>
</html>`);
  } catch (error) {
    console.error("Error al leer README.md:", error.message);
    return res.send("PA API");
  }
});

app.get("/health", async (req, res) => {
  try {
    await getConnection(empresas[0].db).authenticate();
    return res.json({ status: "ok", db: "ok" });
  } catch (error) {
    return res.status(500).json({ status: "error", db: error.message });
  }
});


// API v1
app.use("/v1", planesRouter);

app.post("/createUser", authAdmin, async (req, res) => {
  const { email, password, nombre } = req.body;

  if (!email || !password || !nombre) {
    return res
      .status(400)
      .json({ error: "Faltan parámetros: email, password y nombre son obligatorios" });
  }

  try {
    const sequelize = getConnection("pa7_comun");

    const existente = await sequelize.query(
      "SELECT id FROM usuarios_api_planes WHERE email = :email",
      { replacements: { email }, type: QueryTypes.SELECT }
    );
    if (existente.length) {
      return res.status(409).json({ error: `Ya existe un usuario con el email ${email}` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [id] = await sequelize.query(
      "INSERT INTO usuarios_api_planes (email, password, nombre) VALUES (:email, :password, :nombre)",
      {
        replacements: { email, password: hashedPassword, nombre },
        type: QueryTypes.INSERT,
      }
    );

    return res.status(201).json({ message: "Usuario creado correctamente", id, email, nombre });
  } catch (error) {
    // Sequelize resume los errores de MySQL como "Validation error"; el detalle real está en error.parent
    const detalle = error.parent?.sqlMessage || error.message;
    console.error("Error en createUser:", detalle);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: `Dato duplicado: ${detalle}` });
    }
    return res.status(500).json({ error: detalle });
  }
});

app.post("/getToken", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "Faltan parámetros: email y password son obligatorios" });
  }

  try {
    const usuarios = await getConnection("pa7_comun").query(
      "SELECT id, email, password FROM usuarios_api_planes WHERE email = :email",
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    const usuario = usuarios[0];
    const passwordOk = usuario && (await bcrypt.compare(password, usuario.password));
    if (!passwordOk) {
      return res.status(401).json({ error: "Email o contraseña incorrectos" });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.TOKEN_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({ token, expiresIn: "24h" });
  } catch (error) {
    console.error("Error en getToken:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, (error) => {
  if (!error) console.log("Escuchando en puerto: " + PORT);
  else console.log("Ocurrió un error: ", error);
});
