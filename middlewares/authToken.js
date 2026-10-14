import jwt from "jsonwebtoken";
import { QueryTypes } from "sequelize";
import { getConnection } from "../helpers/getConnection.js";

// Deja pasar solo si llega un token válido, no expirado y de un usuario que sigue existiendo.
// El token se envía en el header: Authorization: Bearer <token>
export const authToken = async (req, res, next) => {
  const authHeader = req.get("authorization") || "";
  const [tipo, token] = authHeader.split(" ");

  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ error: "Falta el token (Authorization: Bearer <token>)" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.TOKEN_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "El token expiró, solicitá uno nuevo" });
    }
    return res.status(401).json({ error: "Token inválido" });
  }

  try {
    const usuario = await getConnection("pa7_comun").query(
      "SELECT id, email, nombre FROM usuarios_api_pa6 WHERE id = :id AND email = :email",
      { replacements: { id: decoded.id, email: decoded.email }, type: QueryTypes.SELECT }
    );
    if (!usuario.length) {
      return res.status(401).json({ error: "El usuario del token ya no existe" });
    }
    req.usuario = usuario[0];
    next();
  } catch (error) {
    console.error("Error en authToken:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

export default authToken;
