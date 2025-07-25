import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import type { Request, Response, NextFunction } from "express"
import { db } from "./database"

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
}

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12)
}

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword)
}

export const generateToken = (payload: object): string => {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" })
}

export const verifyToken = (token: string) => {
  return jwt.verify(token, process.env.JWT_SECRET!)
}

export const generateReferralCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(" ")[1]

    if (!token) {
      return res.status(401).json({ error: "Access token required" })
    }

    const decoded = verifyToken(token) as any
    const user = await db.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true },
    })

    if (!user) {
      return res.status(401).json({ error: "Invalid token" })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(403).json({ error: "Invalid token" })
  }
}

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" })
    }
    next()
  }
}
