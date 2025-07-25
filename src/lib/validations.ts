import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["CUSTOMER", "ORGANIZER"]).default("CUSTOMER"),
  referralCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const eventSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().min(0),
  date: z.string().datetime(),
  time: z.string(),
  location: z.string().min(1),
  category: z.string().min(1),
  availableSeats: z.number().min(1),
  isFree: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
});

export const ticketSchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(["REGULAR", "VIP", "EARLY_BIRD"]).default("REGULAR"),
  price: z.number().min(0),
  quantity: z.number().min(1),
  description: z.string().optional(),
});

export const transactionSchema = z.object({
  eventId: z.string().uuid(),
  items: z.array(
    z.object({
      ticketId: z.string().uuid(),
      quantity: z.number().min(1),
    })
  ),
  couponCode: z.string().optional(),
  pointsToUse: z.number().min(0).default(0),
});

export const reviewSchema = z.object({
  eventId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export const promotionSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().min(1),
  discountPercent: z.number().min(1).max(100),
  maxUses: z.number().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});
