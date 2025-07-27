import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import axios from "axios";

interface ClerkUser {
  id: string;
  email_addresses: Array<{
    email_address: string;
    id: string;
  }>;
  first_name?: string;
  last_name?: string;
  public_metadata?: {
    role?: "CUSTOMER" | "ORGANIZER";
  };
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "CUSTOMER" | "ORGANIZER";
  };
}

// Clerk API configuration
const CLERK_API_URL = "https://api.clerk.com/v1";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!CLERK_SECRET_KEY) {
  console.warn("CLERK_SECRET_KEY not found in environment variables");
}

/**
 * Verify Clerk token and convert to JWT
 */
export const verifyClerkToken = async (
  token: string
): Promise<ClerkUser | null> => {
  try {
    if (!CLERK_SECRET_KEY) {
      console.error("CLERK_SECRET_KEY is not configured");
      return null;
    }

    // Verify token with Clerk API
    const response = await axios.get(
      `${CLERK_API_URL}/sessions/${token}/verify`,
      {
        headers: {
          Authorization: `Bearer ${CLERK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      return response.data;
    }
  } catch (error) {
    console.error("Error verifying Clerk token:", error);
  }
  return null;
};

/**
 * Generate JWT token from Clerk user data
 */
export const generateJWT = (userData: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "CUSTOMER" | "ORGANIZER";
}): string => {
  const payload = {
    userId: userData.id,
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    role: userData.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" });
};

/**
 * Middleware to authenticate Clerk tokens and convert to JWT
 */
export const authenticateClerkToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Check if it's already a JWT token
    if (token.split(".").length === 3) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          firstName: decoded.firstName,
          lastName: decoded.lastName,
          role: decoded.role,
        };
        next();
        return;
      } catch (jwtError) {
        // Not a valid JWT, try as Clerk token
      }
    }

    // Verify as Clerk token
    const clerkUser = await verifyClerkToken(token);

    if (!clerkUser) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    // Extract user data from Clerk
    const email = clerkUser.email_addresses[0]?.email_address || "";
    const firstName = clerkUser.first_name || "";
    const lastName = clerkUser.last_name || "";
    const role =
      (clerkUser.public_metadata?.role as "CUSTOMER" | "ORGANIZER") ||
      "CUSTOMER";

    // Set user data in request
    req.user = {
      id: clerkUser.id,
      email,
      firstName,
      lastName,
      role,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
};

/**
 * Middleware to require specific role
 */
export const requireRole = (allowedRoles: ("CUSTOMER" | "ORGANIZER")[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "Access denied",
        required: allowedRoles,
        current: req.user.role,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to require organizer role
 */
export const requireOrganizer = requireRole(["ORGANIZER"]);

/**
 * Middleware to require customer role
 */
export const requireCustomer = requireRole(["CUSTOMER"]);

export type { AuthRequest };
