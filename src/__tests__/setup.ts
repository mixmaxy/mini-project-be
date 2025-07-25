import { db } from "../lib/database";
import { beforeAll, afterAll, beforeEach } from "@jest/globals";

beforeAll(async () => {
  // Setup test database connection
});

afterAll(async () => {
  // Clean up and disconnect
  await db.$disconnect();
});

beforeEach(async () => {
  // Clean up test data before each test
  await db.transactionCoupon.deleteMany();
  await db.transactionItem.deleteMany();
  await db.transaction.deleteMany();
  await db.review.deleteMany();
  await db.promotion.deleteMany();
  await db.ticket.deleteMany();
  await db.event.deleteMany();
  await db.discountCoupon.deleteMany();
  await db.point.deleteMany();
  await db.user.deleteMany();
});
