import express from "express";
import { z } from "zod";
import { db } from "../lib/database";
import { authenticateToken, requireRole, type AuthRequest } from "../lib/auth";
import { promotionSchema } from "../lib/validations";

const router = express.Router();

// Create promotion (organizer only)
router.post(
  "/",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      const validatedData = promotionSchema.parse(req.body);

      // Check if event exists and belongs to organizer
      const event = await db.event.findFirst({
        where: {
          id: validatedData.eventId,
          organizerId: req.user!.id,
        },
      });

      if (!event) {
        return res
          .status(404)
          .json({ error: "Event not found or unauthorized" });
      }

      const promotion = await db.promotion.create({
        data: {
          ...validatedData,
          startDate: new Date(validatedData.startDate),
          endDate: new Date(validatedData.endDate),
        },
        include: {
          event: {
            select: {
              name: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Promotion created successfully",
        promotion,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Create promotion error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get promotions for event
router.get("/event/:eventId", async (req, res) => {
  try {
    const promotions = await db.promotion.findMany({
      where: {
        eventId: req.params.eventId,
        isActive: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(promotions);
  } catch (error) {
    console.error("Get promotions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get organizer's promotions
router.get(
  "/organizer/my-promotions",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      const promotions = await db.promotion.findMany({
        where: {
          event: {
            organizerId: req.user!.id,
          },
        },
        include: {
          event: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(promotions);
    } catch (error) {
      console.error("Get organizer promotions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update promotion
router.put(
  "/:id",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      const validatedData = promotionSchema.partial().parse(req.body);

      // Check if promotion exists and belongs to organizer's event
      const existingPromotion = await db.promotion.findFirst({
        where: {
          id: req.params.id,
          event: {
            organizerId: req.user!.id,
          },
        },
      });

      if (!existingPromotion) {
        return res
          .status(404)
          .json({ error: "Promotion not found or unauthorized" });
      }

      const updateData: any = { ...validatedData };
      if (validatedData.startDate) {
        updateData.startDate = new Date(validatedData.startDate);
      }
      if (validatedData.endDate) {
        updateData.endDate = new Date(validatedData.endDate);
      }

      const promotion = await db.promotion.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          event: {
            select: {
              name: true,
            },
          },
        },
      });

      res.json({
        message: "Promotion updated successfully",
        promotion,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Update promotion error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete promotion
router.delete(
  "/:id",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      // Check if promotion exists and belongs to organizer's event
      const existingPromotion = await db.promotion.findFirst({
        where: {
          id: req.params.id,
          event: {
            organizerId: req.user!.id,
          },
        },
      });

      if (!existingPromotion) {
        return res
          .status(404)
          .json({ error: "Promotion not found or unauthorized" });
      }

      await db.promotion.delete({
        where: { id: req.params.id },
      });

      res.json({ message: "Promotion deleted successfully" });
    } catch (error) {
      console.error("Delete promotion error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
