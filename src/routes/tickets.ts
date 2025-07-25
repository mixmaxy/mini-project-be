import express from "express";
import { z } from "zod";
import { db } from "../lib/database";
import { authenticateToken, requireRole, type AuthRequest } from "../lib/auth";
import { ticketSchema } from "../lib/validations";

const router = express.Router();

// Create ticket for event (organizer only)
router.post(
  "/",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      const validatedData = ticketSchema.parse(req.body);

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

      const ticket = await db.ticket.create({
        data: validatedData,
        include: {
          event: {
            select: {
              name: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Ticket created successfully",
        ticket,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Create ticket error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get tickets for event
router.get("/event/:eventId", async (req, res) => {
  try {
    const tickets = await db.ticket.findMany({
      where: { eventId: req.params.eventId },
      orderBy: { price: "asc" },
    });

    res.json(tickets);
  } catch (error) {
    console.error("Get tickets error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update ticket (organizer only)
router.put(
  "/:id",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      const validatedData = ticketSchema.partial().parse(req.body);

      // Check if ticket exists and belongs to organizer's event
      const existingTicket = await db.ticket.findFirst({
        where: {
          id: req.params.id,
          event: {
            organizerId: req.user!.id,
          },
        },
      });

      if (!existingTicket) {
        return res
          .status(404)
          .json({ error: "Ticket not found or unauthorized" });
      }

      const ticket = await db.ticket.update({
        where: { id: req.params.id },
        data: validatedData,
        include: {
          event: {
            select: {
              name: true,
            },
          },
        },
      });

      res.json({
        message: "Ticket updated successfully",
        ticket,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Update ticket error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete ticket (organizer only)
router.delete(
  "/:id",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      // Check if ticket exists and belongs to organizer's event
      const existingTicket = await db.ticket.findFirst({
        where: {
          id: req.params.id,
          event: {
            organizerId: req.user!.id,
          },
        },
      });

      if (!existingTicket) {
        return res
          .status(404)
          .json({ error: "Ticket not found or unauthorized" });
      }

      // Check if ticket has been sold
      if (existingTicket.sold > 0) {
        return res
          .status(400)
          .json({ error: "Cannot delete ticket that has been sold" });
      }

      await db.ticket.delete({
        where: { id: req.params.id },
      });

      res.json({ message: "Ticket deleted successfully" });
    } catch (error) {
      console.error("Delete ticket error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
