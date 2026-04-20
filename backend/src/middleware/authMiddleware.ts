/*******************************************************
 * authMiddleware.ts
 *
 * Middleware JWT para SafeTruck.
 * Verifica el token Bearer en el header Authorization
 * y adjunta el payload decodificado a req.user.
 *******************************************************/
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  id: number;
  email: string;
  full_name: string;
}

// Extiende la interfaz Request de Express para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido." });
    return;
  }

  const token = header.slice(7);

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: "Configuración de servidor inválida." });
      return;
    }
    req.user = jwt.verify(token, secret) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado." });
  }
}
