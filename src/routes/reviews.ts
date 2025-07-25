import express from "express";
import { z } from "zod";
import { db } from "../lib/database";
import { authenticateToken, requireRole, type AuthRequest } from "../lib/auth";
import { reviewSchema } from "../lib/validations";
import { paginate } from "../lib/utils";

const router = express.Router();

// Create review (customer only, after attending event)
router.post(
  "/",
  authenticateToken,
  requireRole(["CUSTOMER"]),
  async (req: AuthRequest, res) => {
    try {
      const validatedData = reviewSchema.parse(req.body);

      // Check if user has attended the event
      const transaction = await db.transaction.findFirst({
        where: {
          userId: req.user!.id,
          eventId: validatedData.eventId,
          status: "COMPLETED",
        },
        include: {
          event: {
            select: {
              date: true,
              name: true,
            },
          },
        },
      });

      if (!transaction) {
        return res
          .status(400)
          .json({ error: "You can only review events you have attended" });
      }

      // Check if event has already passed
      if (new Date() < transaction.event.date) {
        return res
          .status(400)
          .json({
            error: "You can only review events after they have occurred",
          });
      }

      // Check if user has already reviewed this event
      const existingReview = await db.review.findUnique({
        where: {
          userId_eventId: {
            userId: req.user!.id,
            eventId: validatedData.eventId,
          },
        },
      });

      if (existingReview) {
        return res
          .status(400)
          .json({ error: "You have already reviewed this event" });
      }

      const review = await db.review.create({
        data: {
          userId: req.user!.id,
          eventId: validatedData.eventId,
          rating: validatedData.rating,
          comment: validatedData.comment,
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          event: {
            select: {
              name: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Review created successfully",
        review,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Create review error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get reviews for an event
router.get("/event/:eventId", async (req, res) => {
  try {
    const { page = "1", limit = "10" } = req.query;
    const { skip, take } = paginate(
      Number.parseInt(page as string),
      Number.parseInt(limit as string)
    );

    const [reviews, total] = await Promise.all([
      db.review.findMany({
        where: { eventId: req.params.eventId },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      db.review.count({ where: { eventId: req.params.eventId } }),
    ]);

    // Calculate average rating
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) /
          reviews.length
        : 0;

    res.json({
      reviews,
      averageRating,
      pagination: {
        page: Number.parseInt(page as string),
        limit: Number.parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / Number.parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update review
router.put(
  "/:id",
  authenticateToken,
  requireRole(["CUSTOMER"]),
  async (req: AuthRequest, res) => {
    try {
      const validatedData = reviewSchema.partial().parse(req.body);

      // Check if review exists and belongs to user
      const existingReview = await db.review.findFirst({
        where: {
          id: req.params.id,
          userId: req.user!.id,
        },
      });

      if (!existingReview) {
        return res
          .status(404)
          .json({ error: "Review not found or unauthorized" });
      }

      const review = await db.review.update({
        where: { id: req.params.id },
        data: validatedData,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          event: {
            select: {
              name: true,
            },
          },
        },
      });

      res.json({
        message: "Review updated successfully",
        review,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Update review error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete review
router.delete(
  "/:id",
  authenticateToken,
  requireRole(["CUSTOMER"]),
  async (req: AuthRequest, res) => {
    try {
      // Check if review exists and belongs to user
      const existingReview = await db.review.findFirst({
        where: {
          id: req.params.id,
          userId: req.user!.id,
        },
      });

      if (!existingReview) {
        return res
          .status(404)
          .json({ error: "Review not found or unauthorized" });
      }

      await db.review.delete({
        where: { id: req.params.id },
      });

      res.json({ message: "Review deleted successfully" });
    } catch (error) {
      console.error("Delete review error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get user's reviews
router.get(
  "/my-reviews",
  authenticateToken,
  requireRole(["CUSTOMER"]),
  async (req: AuthRequest, res) => {
    try {
      const { page = "1", limit = "10" } = req.query;
      const { skip, take } = paginate(
        Number.parseInt(page as string),
        Number.parseInt(limit as string)
      );

      const [reviews, total] = await Promise.all([
        db.review.findMany({
          where: { userId: req.user!.id },
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: {
            event: {
              select: {
                name: true,
                date: true,
                imageUrl: true,
              },
            },
          },
        }),
        db.review.count({ where: { userId: req.user!.id } }),
      ]);

      res.json({
        reviews,
        pagination: {
          page: Number.parseInt(page as string),
          limit: Number.parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / Number.parseInt(limit as string)),
        },
      });
    } catch (error) {
      console.error("Get user reviews error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
