/*******************************************************
 * db.ts
 *
 * Módulo de conexión a PostgreSQL.
 * Exporta un pool de conexiones reutilizable para
 * que el resto del backend no abra una conexión nueva
 * en cada request.
 *******************************************************/

import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "safetruck",
  user: "postgres",
  password: "postgres",
});

export default pool;