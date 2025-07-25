import express from "express";
import { db } from "../lib/database";
import { authenticateToken, requireRole, type AuthRequest } from "../lib/auth";

const router = express.Router();

// Get organizer dashboard statistics
router.get(
  "/organizer/stats",
  authenticateToken,
  requireRole(["ORGANIZER"]),
  async (req: AuthRequest, res) => {
    try {
      const { period = "month" } = req.query;

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case "day":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // Get basic statistics
      const [totalEvents, totalRevenue, totalTicketsSold, totalAttendees] =
        await Promise.all([
          db.event.count({
            where: {
              organizerId: req.user!.id,
              createdAt: { gte: startDate },
            },
          }),
          db.transaction.aggregate({
            where: {
              event: { organizerId: req.user!.id },
              status: "COMPLETED",
              createdAt: { gte: startDate },
            },
            _sum: { finalAmount: true },
          }),
          db.transactionItem.aggregate({
            where: {
              transaction: {
                event: { organizerId: req.user!.id },
                status: "COMPLETED",
                createdAt: { gte: startDate },
              },
            },
            _sum: { quantity: true },
          }),
          db.transaction.count({
            where: {
              event: { organizerId: req.user!.id },
              status: "COMPLETED",
              createdAt: { gte: startDate },
            },
          }),
        ]);

      // Get revenue by period for chart
      const revenueByPeriod = await db.transaction.groupBy({
        by: ["createdAt"],
        where: {
          event: { organizerId: req.user!.id },
          status: "COMPLETED",
          createdAt: { gte: startDate },
        },
        _sum: { finalAmount: true },
        orderBy: { createdAt: "asc" },
      });

      // Get top events by revenue
      const topEvents = await db.event.findMany({
        where: {
          organizerId: req.user!.id,
          createdAt: { gte: startDate },
        },
        include: {
          transactions: {
            where: { status: "COMPLETED" },
            select: { finalAmount: true },
          },
          _count: {
            select: { transactions: true },
          },
        },
        take: 5,
      });

      const topEventsByRevenue = topEvents
        .map((event) => ({
          id: event.id,
          name: event.name,
          revenue: event.transactions.reduce(
            (sum, t) => sum + t.finalAmount,
            0
          ),
          attendees: event._count.transactions,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // Get event status distribution
      const eventStatusDistribution = await db.event.groupBy({
        by: ["status"],
        where: {
          organizerId: req.user!.id,
          createdAt: { gte: startDate },
        },
        _count: { status: true },
      });

      res.json({
        summary: {
          totalEvents,
          totalRevenue: totalRevenue._sum.finalAmount || 0,
          totalTicketsSold: totalTicketsSold._sum.quantity || 0,
          totalAttendees,
        },
        charts: {
          revenueByPeriod: revenueByPeriod.map((item) => ({
            date: item.createdAt,
            revenue: item._sum.finalAmount || 0,
          })),
          topEvents: topEventsByRevenue,
          eventStatusDistribution: eventStatusDistribution.map((item) => ({
            status: item.status,
            count: item._count.status,
          })),
        },
      });
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get customer dashboard statistics
router.get(
  "/customer/stats",
  authenticateToken,
  requireRole(["CUSTOMER"]),
  async (req: AuthRequest, res) => {
    try {
      const [totalTransactions, totalSpent, upcomingEvents, attendedEvents] =
        await Promise.all([
          db.transaction.count({
            where: {
              userId: req.user!.id,
              status: "COMPLETED",
            },
          }),
          db.transaction.aggregate({
            where: {
              userId: req.user!.id,
              status: "COMPLETED",
            },
            _sum: { finalAmount: true },
          }),
          db.transaction.count({
            where: {
              userId: req.user!.id,
              status: "COMPLETED",
              event: {
                date: { gte: new Date() },
              },
            },
          }),
          db.transaction.count({
            where: {
              userId: req.user!.id,
              status: "COMPLETED",
              event: {
                date: { lt: new Date() },
              },
            },
          }),
        ]);

      // Get user's points and referral stats
      const user = await db.user.findUnique({
        where: { id: req.user!.id },
        select: {
          pointsBalance: true,
          referralCode: true,
        },
      });

      const referralCount = await db.user.count({
        where: { referredBy: req.user!.id },
      });

      // Get recent transactions
      const recentTransactions = await db.transaction.findMany({
        where: {
          userId: req.user!.id,
          status: "COMPLETED",
        },
        take: 5,
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
      });

      res.json({
        summary: {
          totalTransactions,
          totalSpent: totalSpent._sum.finalAmount || 0,
          upcomingEvents,
          attendedEvents,
          pointsBalance: user?.pointsBalance || 0,
          referralCount,
        },
        referralCode: user?.referralCode,
        recentTransactions,
      });
    } catch (error) {
      console.error("Get customer dashboard stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
