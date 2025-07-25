import express from "express";
import { z } from "zod";
import { db } from "../lib/database";
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateReferralCode,
} from "../lib/auth";
import { addPointsToUser, createReferralDiscount } from "../lib/utils";
import { registerSchema, loginSchema } from "../lib/validations";

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Check referral code if provided
    let referredBy = null;
    if (validatedData.referralCode) {
      const referrer = await db.user.findUnique({
        where: { referralCode: validatedData.referralCode.toUpperCase() },
      });

      if (!referrer) {
        return res.status(400).json({ error: "Invalid referral code" });
      }
      referredBy = referrer.id;
    }

    // Hash password and generate referral code
    const hashedPassword = await hashPassword(validatedData.password);
    const referralCode = generateReferralCode();

    // Create user
    const user = await db.user.create({
      data: {
        email: validatedData.email,
        password: hashedPassword,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: validatedData.role,
        referralCode,
        referredBy,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        referralCode: true,
      },
    });

    // Handle referral rewards
    if (referredBy) {
      // Give points to referrer (10,000 points)
      await addPointsToUser(
        referredBy,
        10000,
        `Referral bonus from ${user.firstName} ${user.lastName}`
      );

      // Give discount coupon to new user (10% discount)
      await createReferralDiscount(user.id);
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      message: "User registered successfully",
      user,
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);

    // Find user
    const user = await db.user.findUnique({
      where: { email: validatedData.email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const isValidPassword = await comparePassword(
      validatedData.password,
      user.password
    );
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        referralCode: user.referralCode,
        pointsBalance: user.pointsBalance,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
