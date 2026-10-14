import { Sequelize } from "sequelize";
import { empresas } from "../empresas.js";

// Una conexión (pool) por base de datos, reutilizada entre requests
const conexiones = {};

export const getEmpresa = (codigo) =>
  empresas.find((e) => e.codigo === Number(codigo));

export const getConnection = (db) => {
  if (!conexiones[db]) {
    conexiones[db] = new Sequelize(
      db,
      process.env.DB_USERNAME,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        dialect: process.env.DB_DIALECT,
        logging: false,
      }
    );
  }
  return conexiones[db];
};
