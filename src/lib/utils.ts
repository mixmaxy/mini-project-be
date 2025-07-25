import { db } from "./database";

export const calculatePoints = (amount: number): number => {
  // 1 point per 1000 IDR spent
  return Math.floor(amount / 1000);
};

export const addPointsToUser = async (
  userId: string,
  points: number,
  description: string
) => {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 3); // 3 months from now

  await db.point.create({
    data: {
      earnedById: userId,
      amount: points,
      description,
      expiresAt,
    },
  });

  // Update user's points balance
  await db.user.update({
    where: { id: userId },
    data: {
      pointsBalance: {
        increment: points,
      },
    },
  });
};

export const createReferralDiscount = async (userId: string) => {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 3); // 3 months from now

  const code = `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  await db.discountCoupon.create({
    data: {
      userId,
      code,
      discountPercent: 10, // 10% discount
      expiresAt,
    },
  });
};

export const cleanupExpiredPoints = async () => {
  const expiredPoints = await db.point.findMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
      isUsed: false,
    },
  });

  for (const point of expiredPoints) {
    if (point.earnedById) {
      await db.user.update({
        where: { id: point.earnedById },
        data: {
          pointsBalance: {
            decrement: point.amount,
          },
        },
      });
    }
  }

  await db.point.updateMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
      isUsed: false,
    },
    data: {
      isUsed: true,
    },
  });
};

export const paginate = (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  return { skip, take: limit };
};
