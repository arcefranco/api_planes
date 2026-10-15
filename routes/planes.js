import { Router } from "express";
import { QueryTypes } from "sequelize";
import { getConnection, getEmpresa } from "../helpers/getConnection.js";
import { authToken } from "../middlewares/authToken.js";

const router = Router();

// Base de AUTOCERVO (codigo 6 en empresas.js -> pa7_acv)
const DB_PLANES = getEmpresa(6).db;

const PARAMETROS_PERMITIDOS = [
  "fecha_desde",
  "fecha_hasta",
  "scoring_desde",
  "scoring_hasta",
  "estado",
  "limite",
  "cursor",
];
const ESTADOS = ["precargada", "pendiente_scoring", "scoring_ok", "rechazada"];
const LIMITE_DEFECTO = 200;
const LIMITE_MAXIMO = 500;

// Consulta base: devuelve todas las solicitudes con los 9 campos del spec.
// Se usa tal cual, como tabla derivada; los filtros, el orden y el paginado se aplican por fuera.
const CONSULTA_BASE = `
SELECT r.Solicitud AS numero_solicitud, r.fechaAlta AS fecha_alta, v.Nombre AS vendedor,
NULL AS cuota1_cobrada, NULL AS es_sena, NULL AS debito_automatico, "precargada" AS estado, NULL AS fecha_scoring,
NULL AS cliente_nombre
FROM rendicion r
LEFT JOIN vendedores v ON r.Vendedor = v.Codigo
LEFT JOIN pre_solicitudes p ON r.Solicitud = p.Solicitud
WHERE net_getnumpresol_Rendicion(r.Marca,r.Solicitud) <> 1 AND IFNULL(p.AnuladaCliente,0) = 0

UNION ALL

SELECT p.Solicitud, p.FechaAlta, v.Nombre nomVendedor,
SUM(ps.Importe) cuota1_cobrada, IF(IFNULL(SUM(ps.Importe),0)>p.ImporteTotalCuota,1,0), p.DebitoAutomatico,
CASE     WHEN p.EstadoPreScoring = 2 THEN "scoring_ok"
                WHEN p.EstadoPreScoring = 0 THEN "pendiente_scoring"
                WHEN (p.EstadoPreScoring = 1 OR p.EstadoPreScoring = 3 OR p.EstadoPreScoring = 4) THEN "rechazada"
  END estado,
p.FechaPreScoring, CONCAT(p.Nombres,p.Apellido) cliente_nombre
FROM pre_solicitudes p LEFT JOIN
pre_senias ps ON p.Numero = ps.Numero LEFT JOIN
vendedores v ON p.Vendedor = v.Codigo
WHERE p.EstadoPreScoring IN (0,1,2,3,4)
GROUP BY p.Solicitud
`;

// ---------- helpers ----------

class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

const enviarError = (res, status, codigo, mensaje) =>
  res.status(status).json({ error: { codigo, mensaje } });

// AAAA-MM-DD y que sea una fecha real (rechaza 2026-02-30)
const esFechaValida = (texto) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

// El cursor es opaco para el cliente: base64url de {"ns": <último numero_solicitud entregado>}
const codificarCursor = (numeroSolicitud) =>
  Buffer.from(JSON.stringify({ ns: numeroSolicitud }), "utf8").toString("base64url");

const decodificarCursor = (cursor) => {
  try {
    const { ns } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (ns === undefined || ns === null || ns === "") throw new Error();
    return ns;
  } catch {
    throw new ErrorApi(400, "parametro_invalido", "cursor no es válido");
  }
};

// TINYINT, BIT (llega como Buffer), NULL -> boolean
const aBooleano = (valor) => {
  if (valor === null || valor === undefined) return false;
  if (Buffer.isBuffer(valor)) return valor[0] === 1;
  return Number(valor) === 1;
};

// Fecha y hora actual en Argentina, ISO 8601 con zona: 2026-10-13T18:45:00-03:00
const ahoraArgentina = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
};

// Valida query params y arma { condiciones, replacements, limite }
const leerParametros = (query) => {
  for (const nombre of Object.keys(query)) {
    if (!PARAMETROS_PERMITIDOS.includes(nombre)) {
      throw new ErrorApi(400, "parametro_desconocido", `${nombre} no es un parámetro válido`);
    }
    if (typeof query[nombre] !== "string") {
      throw new ErrorApi(400, "parametro_invalido", `${nombre} se envió más de una vez o con formato inválido`);
    }
  }

  const condiciones = [];
  const replacements = {};

  for (const nombre of ["fecha_desde", "fecha_hasta", "scoring_desde", "scoring_hasta"]) {
    if (query[nombre] !== undefined && !esFechaValida(query[nombre])) {
      throw new ErrorApi(400, "parametro_invalido", `${nombre} no es una fecha AAAA-MM-DD`);
    }
  }

  // Fecha de alta, ambos días inclusive
  if (query.fecha_desde) {
    condiciones.push("DATE(fecha_alta) >= :fecha_desde");
    replacements.fecha_desde = query.fecha_desde;
  }
  if (query.fecha_hasta) {
    condiciones.push("DATE(fecha_alta) <= :fecha_hasta");
    replacements.fecha_hasta = query.fecha_hasta;
  }

  // Fecha de scoring: sólo solicitudes en scoring_ok
  if (query.scoring_desde || query.scoring_hasta) {
    condiciones.push("estado = 'scoring_ok'");
  }
  if (query.scoring_desde) {
    condiciones.push("DATE(fecha_scoring) >= :scoring_desde");
    replacements.scoring_desde = query.scoring_desde;
  }
  if (query.scoring_hasta) {
    condiciones.push("DATE(fecha_scoring) <= :scoring_hasta");
    replacements.scoring_hasta = query.scoring_hasta;
  }

  if (query.estado !== undefined) {
    if (!ESTADOS.includes(query.estado)) {
      throw new ErrorApi(400, "parametro_invalido", `estado debe ser uno de: ${ESTADOS.join(", ")}`);
    }
    condiciones.push("estado = :estado");
    replacements.estado = query.estado;
  }

  let limite = LIMITE_DEFECTO;
  if (query.limite !== undefined) {
    if (!/^\d+$/.test(query.limite) || Number(query.limite) < 1 || Number(query.limite) > LIMITE_MAXIMO) {
      throw new ErrorApi(400, "parametro_invalido", `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}`);
    }
    limite = Number(query.limite);
  }

  // Paginado por cursor (keyset): traer sólo lo posterior al último numero_solicitud entregado
  if (query.cursor !== undefined) {
    condiciones.push("numero_solicitud > :cursor");
    replacements.cursor = decodificarCursor(query.cursor);
  }

  return { condiciones, replacements, limite };
};

// ---------- endpoint ----------

// GET /v1/planes
router.get("/planes",  authToken, async (req, res) => {
  try {
    const { condiciones, replacements, limite } = leerParametros(req.query);

    // Se pide un registro de más (limite + 1) sólo para saber si hay otra página
    const sql = `
      SELECT
        numero_solicitud,
        DATE_FORMAT(fecha_alta, '%Y-%m-%d') AS fecha_alta,
        vendedor,
        cuota1_cobrada,
        es_sena,
        debito_automatico,
        estado,
        IF(estado = 'scoring_ok', DATE_FORMAT(fecha_scoring, '%Y-%m-%d'), NULL) AS fecha_scoring,
        cliente_nombre
      FROM (${CONSULTA_BASE}) planes
      ${condiciones.length ? "WHERE " + condiciones.join(" AND ") : ""}
      ORDER BY numero_solicitud ASC
      LIMIT :limiteMasUno
    `;

    const filas = await getConnection(DB_PLANES).query(sql, {
      replacements: { ...replacements, limiteMasUno: limite + 1 },
      type: QueryTypes.SELECT,
    });

    const hayMas = filas.length > limite;
    const pagina = hayMas ? filas.slice(0, limite) : filas;

    const datos = pagina.map((f) => ({
      numero_solicitud: String(f.numero_solicitud),
      fecha_alta: f.fecha_alta,
      vendedor: f.vendedor,
      cuota1_cobrada: f.cuota1_cobrada === null ? 0 : Number(f.cuota1_cobrada),
      es_sena: aBooleano(f.es_sena),
      debito_automatico: aBooleano(f.debito_automatico),
      estado: f.estado,
      fecha_scoring: f.fecha_scoring,
      cliente_nombre: f.cliente_nombre,
    }));

    return res.json({
      datos,
      siguiente_cursor: hayMas ? codificarCursor(pagina[pagina.length - 1].numero_solicitud) : null,
      generado_en: ahoraArgentina(),
    });
  } catch (error) {
    if (error instanceof ErrorApi) {
      return enviarError(res, error.status, error.codigo, error.message);
    }
    // El detalle va al log; al cliente nunca se le expone información de la base
    console.error("Error en GET /v1/planes:", error.parent?.sqlMessage || error.message);
    if (error.name?.startsWith("SequelizeConnection") || error.name === "SequelizeHostNotFoundError") {
      return enviarError(res, 503, "servicio_no_disponible", "El servicio no está disponible, reintentá en unos minutos");
    }
    return enviarError(res, 500, "error_interno", "Ocurrió un error interno");
  }
});

export default router;
