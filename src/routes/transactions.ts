import express from "express";
import { z } from "zod";
import { db } from "../lib/database";
import { authenticateToken, requireRole, type AuthRequest } from "../lib/auth";
import { transactionSchema } from "../lib/validations";
import { paginate, calculatePoints, addPointsToUser } from "../lib/utils";

const router = express.Router();

// Create transaction (customer only)
router.post(
  "/",
  authenticateToken,
  requireRole(["CUSTOMER"]),
  async (req: AuthRequest, res) => {
    try {
      const validatedData = transactionSchema.parse(req.body);

      // Start database transaction
      const result = await db.$transaction(async (prisma) => {
        // Get event and tickets
        const event = await prisma.event.findUnique({
          where: { id: validatedData.eventId },
          include: { tickets: true },
        });

        if (!event) {
          throw new Error("Event not found");
        }

        if (event.status !== "PUBLISHED") {
          throw new Error("Event is not available for booking");
        }

        // Calculate total amount and validate tickets
        let totalAmount = 0;
        const ticketUpdates: Array<{
          id: string;
          quantity: number;
          price: number;
        }> = [];

        for (const item of validatedData.items) {
          const ticket = event.tickets.find((t) => t.id === item.ticketId);
          if (!ticket) {
            throw new Error(`Ticket ${item.ticketId} not found`);
          }

          if (ticket.sold + item.quantity > ticket.quantity) {
            throw new Error(`Not enough tickets available for ${ticket.type}`);
          }

          totalAmount += ticket.price * item.quantity;
          ticketUpdates.push({
            id: ticket.id,
            quantity: item.quantity,
            price: ticket.price,
          });
        }

        // Check available seats
        const totalTickets = validatedData.items.reduce(
          (sum, item) => sum + item.quantity,
          0
        );
        if (event.bookedSeats + totalTickets > event.availableSeats) {
          throw new Error("Not enough seats available");
        }

        // Apply referral discount if user has unused coupons
        let discountAmount = 0;
        const usedCoupons: string[] = [];

        if (validatedData.couponCode) {
          const coupon = await prisma.discountCoupon.findFirst({
            where: {
              code: validatedData.couponCode,
              isUsed: false,
              expiresAt: { gte: new Date() },
            },
          });

          if (coupon) {
            discountAmount = Math.floor(
              (totalAmount * coupon.discountPercent) / 100
            );
            usedCoupons.push(coupon.id);
          }
        } else {
          // Auto-apply available referral discount if no specific coupon provided
          const availableCoupon = await prisma.discountCoupon.findFirst({
            where: {
              userId: req.user!.id,
              isUsed: false,
              expiresAt: { gte: new Date() },
            },
            orderBy: { discountPercent: "desc" }, // Use highest discount first
          });

          if (availableCoupon) {
            discountAmount = Math.floor(
              (totalAmount * availableCoupon.discountPercent) / 100
            );
            usedCoupons.push(availableCoupon.id);
          }
        }

        // Apply points discount
        const user = await prisma.user.findUnique({
          where: { id: req.user!.id },
        });

        if (!user) {
          throw new Error("User not found");
        }

        const pointsToUse = Math.min(
          validatedData.pointsToUse,
          user.pointsBalance,
          totalAmount - discountAmount
        );
        const pointsDiscount = pointsToUse;

        const finalAmount = totalAmount - discountAmount - pointsDiscount;

        // Create transaction
        const transaction = await prisma.transaction.create({
          data: {
            userId: req.user!.id,
            eventId: validatedData.eventId,
            totalAmount,
            discountAmount,
            finalAmount,
            pointsUsed: pointsToUse,
            status: "COMPLETED", // In real app, this would be PENDING until payment
          },
        });

        // Create transaction items
        for (let i = 0; i < validatedData.items.length; i++) {
          const item = validatedData.items[i];
          const ticketUpdate = ticketUpdates[i];

          await prisma.transactionItem.create({
            data: {
              transactionId: transaction.id,
              ticketId: item.ticketId,
              quantity: item.quantity,
              unitPrice: ticketUpdate.price,
              totalPrice: ticketUpdate.price * item.quantity,
            },
          });

          // Update ticket sold count
          await prisma.ticket.update({
            where: { id: item.ticketId },
            data: {
              sold: { increment: item.quantity },
            },
          });
        }

        // Update event booked seats
        await prisma.event.update({
          where: { id: validatedData.eventId },
          data: {
            bookedSeats: { increment: totalTickets },
          },
        });

        // Mark coupons as used
        for (const couponId of usedCoupons) {
          await prisma.discountCoupon.update({
            where: { id: couponId },
            data: { isUsed: true },
          });

          await prisma.transactionCoupon.create({
            data: {
              transactionId: transaction.id,
              discountCouponId: couponId,
            },
          });
        }

        // Deduct points from user
        if (pointsToUse > 0) {
          await prisma.user.update({
            where: { id: req.user!.id },
            data: {
              pointsBalance: { decrement: pointsToUse },
            },
          });

          // Mark points as used
          const userPoints = await prisma.point.findMany({
            where: {
              earnedById: req.user!.id,
              isUsed: false,
              expiresAt: { gte: new Date() },
            },
            orderBy: { createdAt: "asc" },
          });

          let remainingPointsToUse = pointsToUse;
          for (const point of userPoints) {
            if (remainingPointsToUse <= 0) break;

            if (point.amount <= remainingPointsToUse) {
              await prisma.point.update({
                where: { id: point.id },
                data: { isUsed: true, usedById: req.user!.id },
              });
              remainingPointsToUse -= point.amount;
            }
          }
        }

        // Award points for purchase (1 point per 1000 IDR)
        const earnedPoints = calculatePoints(finalAmount);
        if (earnedPoints > 0) {
          await addPointsToUser(
            req.user!.id,
            earnedPoints,
            `Purchase points for ${event.name}`
          );
        }

        return transaction;
      });

      // Get complete transaction data
      const completeTransaction = await db.transaction.findUnique({
        where: { id: result.id },
        include: {
          event: {
            select: {
              name: true,
              date: true,
              location: true,
            },
          },
          items: {
            include: {
              ticket: {
                select: {
                  type: true,
                  price: true,
                },
              },
            },
          },
        },
      });

      res.status(201).json({
        message: "Transaction created successfully",
        transaction: completeTransaction,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Create transaction error:", error);
      res
        .status(400)
        .json({
          error: error instanceof Error ? error.message : "Transaction failed",
        });
    }
  }
);

// Get user transactions
router.get(
  "/my-transactions",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { page = "1", limit = "10" } = req.query;
      const { skip, take } = paginate(
        Number.parseInt(page as string),
        Number.parseInt(limit as string)
      );

      const [transactions, total] = await Promise.all([
        db.transaction.findMany({
          where: { userId: req.user!.id },
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: {
            event: {
              select: {
                name: true,
                date: true,
                location: true,
                imageUrl: true,
              },
            },
            items: {
              include: {
                ticket: {
                  select: {
                    type: true,
                    price: true,
                  },
                },
              },
            },
          },
        }),
        db.transaction.count({ where: { userId: req.user!.id } }),
      ]);

      res.json({
        transactions,
        pagination: {
          page: Number.parseInt(page as string),
          limit: Number.parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / Number.parseInt(limit as string)),
        },
      });
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get transaction by ID
router.get("/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const transaction = await db.transaction.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
      include: {
        event: {
          select: {
            name: true,
            date: true,
            time: true,
            location: true,
            imageUrl: true,
          },
        },
        items: {
          include: {
            ticket: {
              select: {
                type: true,
                price: true,
                description: true,
              },
            },
          },
        },
        usedCoupons: {
          include: {
            discountCoupon: {
              select: {
                code: true,
                discountPercent: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(transaction);
  } catch (error) {
    console.error("Get transaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get organizer transactions
router.get(
  "/organizer/sales",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      const { page = "1", limit = "10", eventId } = req.query;
      const { skip, take } = paginate(
        Number.parseInt(page as string),
        Number.parseInt(limit as string)
      );

      const where: any = {
        event: {
          organizerId: req.user!.id,
        },
      };

      if (eventId) {
        where.eventId = eventId as string;
      }

      const [transactions, total] = await Promise.all([
        db.transaction.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            event: {
              select: {
                name: true,
                date: true,
              },
            },
            items: {
              include: {
                ticket: {
                  select: {
                    type: true,
                  },
                },
              },
            },
          },
        }),
        db.transaction.count({ where }),
      ]);

      res.json({
        transactions,
        pagination: {
          page: Number.parseInt(page as string),
          limit: Number.parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / Number.parseInt(limit as string)),
        },
      });
    } catch (error) {
      console.error("Get organizer transactions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
