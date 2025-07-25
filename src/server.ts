import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Import routes
import authRoutes from "./routes/auth"
import eventRoutes from "./routes/events"
import transactionRoutes from "./routes/transactions"
import reviewRoutes from "./routes/reviews"
import ticketRoutes from "./routes/tickets"
import dashboardRoutes from "./routes/dashboard"
import promotionRoutes from "./routes/promotions"

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/events", eventRoutes)
app.use("/api/transactions", transactionRoutes)
app.use("/api/reviews", reviewRoutes)
app.use("/api/tickets", ticketRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/promotions", promotionRoutes)

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Base URL: http://localhost:${PORT}/api`);
});

export default app;
