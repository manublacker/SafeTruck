/*******************************************************
 * auth.ts
 *
 * Endpoints de autenticación de SafeTruck.
 *   POST /api/auth/register  — Crear cuenta nueva
 *   POST /api/auth/login     — Iniciar sesión
 *******************************************************/
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db";

const router = Router();
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "24h";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signToken(payload: { id: number; email: string; full_name: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET no configurado.");
  return jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY });
}

interface TruckRow {
  id: number;
  name: string;
  max_weight_kg: number;
  max_height_m: number;
  max_width_m: number;
  max_length_m: number;
  created_at: string;
}

async function getTrucksForUser(userId: number): Promise<TruckRow[]> {
  const result = await pool.query<TruckRow>(
    `SELECT id, name, max_weight_kg, max_height_m, max_width_m, max_length_m, created_at
     FROM trucks
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

/**
 * Body:
 *   email       string (required)
 *   password    string (required, min 6 chars)
 *   full_name   string (required)
 *   company     string (optional)
 *   trucks      Array<{ name, max_weight_kg, max_height_m, max_width_m, max_length_m }> (optional)
 */
router.post("/register", async (req: Request, res: Response) => {
  const { email, password, full_name, company, trucks } = req.body;

  // Validate required fields
  if (!email || !password || !full_name) {
    res.status(400).json({ error: "email, password y full_name son requeridos." });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if email already exists
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "El email ya está registrado." });
      return;
    }

    // Hash password and insert user
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userResult = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, full_name, company)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email.toLowerCase().trim(), passwordHash, full_name, company ?? null]
    );
    const userId = userResult.rows[0].id;

    // Insert initial trucks if provided
    const truckList = Array.isArray(trucks) ? trucks : [];
    for (const truck of truckList) {
      const { name, max_weight_kg, max_height_m, max_width_m, max_length_m } = truck;
      if (!name || max_weight_kg == null || max_height_m == null || max_width_m == null || max_length_m == null) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Cada camión debe tener name, max_weight_kg, max_height_m, max_width_m y max_length_m." });
        return;
      }
      await client.query(
        `INSERT INTO trucks (user_id, name, max_weight_kg, max_height_m, max_width_m, max_length_m)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, name, max_weight_kg, max_height_m, max_width_m, max_length_m]
      );
    }

    await client.query("COMMIT");

    const savedTrucks = await getTrucksForUser(userId);
    const token = signToken({ id: userId, email: email.toLowerCase().trim(), full_name });

    res.status(201).json({
      token,
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        full_name,
        company: company ?? null,
        trucks: savedTrucks,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error en /register:", err);
    res.status(500).json({ error: "Error interno al registrar usuario." });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

/**
 * Body:
 *   email     string (required)
 *   password  string (required)
 */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "email y password son requeridos." });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, full_name, company
       FROM users
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (!result.rowCount || result.rowCount === 0) {
      res.status(401).json({ error: "Credenciales inválidas." });
      return;
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ error: "Credenciales inválidas." });
      return;
    }

    const trucks = await getTrucksForUser(user.id);
    const token = signToken({ id: user.id, email: user.email, full_name: user.full_name });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        company: user.company,
        trucks,
      },
    });
  } catch (err) {
    console.error("Error en /login:", err);
    res.status(500).json({ error: "Error interno al iniciar sesión." });
  }
});

export default router;
