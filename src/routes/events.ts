import express from "express";
import { z } from "zod";
import { db } from "../lib/database";
import {
  authenticateClerkToken,
  requireOrganizer,
  type AuthRequest,
} from "../lib/clerk-auth";
import { eventSchema } from "../lib/validations";
import { paginate } from "../lib/utils";

const router = express.Router();

// Get all events (public)
router.get("/", async (req, res) => {
  try {
    const {
      page = "1",
      limit = "10",
      search = "",
      category = "",
      location = "",
      sortBy = "date",
      sortOrder = "asc",
    } = req.query;

    const { skip, take } = paginate(
      Number.parseInt(page as string),
      Number.parseInt(limit as string)
    );

    const where: any = {
      status: "PUBLISHED",
      date: {
        gte: new Date(),
      },
    };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.category = { contains: category as string, mode: "insensitive" };
    }

    if (location) {
      where.location = { contains: location as string, mode: "insensitive" };
    }

    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const [events, total] = await Promise.all([
      db.event.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          tickets: true,
          reviews: {
            select: {
              rating: true,
            },
          },
          _count: {
            select: {
              transactions: true,
            },
          },
        },
      }),
      db.event.count({ where }),
    ]);

    // Calculate average rating for each event
    const eventsWithRating = events.map((event) => ({
      ...event,
      averageRating:
        event.reviews.length > 0
          ? event.reviews.reduce((sum, review) => sum + review.rating, 0) /
            event.reviews.length
          : 0,
      totalBookings: event._count.transactions,
    }));

    res.json({
      events: eventsWithRating,
      pagination: {
        page: Number.parseInt(page as string),
        limit: Number.parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / Number.parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error("Get events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get event by ID (public)
router.get("/:id", async (req, res) => {
  try {
    const event = await db.event.findUnique({
      where: { id: req.params.id },
      include: {
        organizer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        tickets: true,
        reviews: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        promotions: {
          where: {
            isActive: true,
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Calculate average rating
    const averageRating =
      event.reviews.length > 0
        ? event.reviews.reduce((sum, review) => sum + review.rating, 0) /
          event.reviews.length
        : 0;

    res.json({
      ...event,
      averageRating,
    });
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create event (organizer only)
router.post(
  "/",
  authenticateClerkToken,
  requireOrganizer,
  async (req: AuthRequest, res) => {
    try {
      const validatedData = eventSchema.parse(req.body);

      const event = await db.event.create({
        data: {
          ...validatedData,
          date: new Date(validatedData.date),
          organizerId: req.user!.id,
        },
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Event created successfully",
        event,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Create event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update event (organizer only)
router.put(
  "/:id",
  authenticateClerkToken,
  requireOrganizer,
  async (req: AuthRequest, res) => {
    try {
      const validatedData = eventSchema.partial().parse(req.body);

      // Check if event exists and belongs to user
      const existingEvent = await db.event.findFirst({
        where: {
          id: req.params.id,
          organizerId: req.user!.id,
        },
      });

      if (!existingEvent) {
        return res
          .status(404)
          .json({ error: "Event not found or unauthorized" });
      }

      const updateData: any = { ...validatedData };
      if (validatedData.date) {
        updateData.date = new Date(validatedData.date);
      }

      const event = await db.event.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      res.json({
        message: "Event updated successfully",
        event,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Update event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete event (organizer only)
router.delete(
  "/:id",
  authenticateClerkToken,
  requireOrganizer,
  async (req: AuthRequest, res) => {
    try {
      // Check if event exists and belongs to user
      const existingEvent = await db.event.findFirst({
        where: {
          id: req.params.id,
          organizerId: req.user!.id,
        },
      });

      if (!existingEvent) {
        return res
          .status(404)
          .json({ error: "Event not found or unauthorized" });
      }

      await db.event.delete({
        where: { id: req.params.id },
      });

      res.json({ message: "Event deleted successfully" });
    } catch (error) {
      console.error("Delete event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get organizer's events
router.get(
  "/organizer/my-events",
  authenticateClerkToken,
  requireOrganizer,
  async (req: AuthRequest, res) => {
    try {
      const { page = "1", limit = "10" } = req.query;
      const { skip, take } = paginate(
        Number.parseInt(page as string),
        Number.parseInt(limit as string)
      );

      const [events, total] = await Promise.all([
        db.event.findMany({
          where: { organizerId: req.user!.id },
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: {
            tickets: true,
            _count: {
              select: {
                transactions: true,
                reviews: true,
              },
            },
          },
        }),
        db.event.count({ where: { organizerId: req.user!.id } }),
      ]);

      res.json({
        events,
        pagination: {
          page: Number.parseInt(page as string),
          limit: Number.parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / Number.parseInt(limit as string)),
        },
      });
    } catch (error) {
      console.error("Get organizer events error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
