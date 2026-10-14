import crypto from "crypto";

// Solo deja pasar si el header "x-admin-key" coincide con ADMIN_KEY del .env
export const authAdmin = (req, res, next) => {
  const adminKey = process.env.ADMIN_KEY;
  const claveRecibida = req.get("x-admin-key");

  if (!adminKey) {
    console.error("ADMIN_KEY no está definida en el .env");
    return res.status(500).json({ error: "Configuración incompleta del servidor" });
  }

  if (!claveRecibida) {
    return res.status(401).json({ error: "Falta el header x-admin-key" });
  }

  // Comparación en tiempo constante para no filtrar información de la clave
  const a = Buffer.from(claveRecibida);
  const b = Buffer.from(adminKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Clave de administrador inválida" });
  }

  next();
};

export default authAdmin;
