import { db } from "../lib/database";
import { hashPassword, generateReferralCode } from "../lib/auth";

async function main() {
  console.log("🌱 Starting database seed...");

  // Clear existing data in correct order to avoid foreign key constraints
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

  // Create users
  const hashedPassword = await hashPassword("password123");

  // Create organizers
  const organizers = [];
  for (let i = 1; i <= 15; i++) {
    const organizer = await db.user.create({
      data: {
        email: `organizer${i}@example.com`,
        password: hashedPassword,
        firstName: `Organizer${i}`,
        lastName: `User`,
        role: "ORGANIZER",
        referralCode: generateReferralCode(),
        pointsBalance: Math.floor(Math.random() * 50000),
        isVerified: true,
      },
    });
    organizers.push(organizer);
  }

  // Create customers
  const customers: any[] = [];
  for (let i = 1; i <= 50; i++) {
    const customer = await db.user.create({
      data: {
        email: `customer${i}@example.com`,
        password: hashedPassword,
        firstName: `Customer${i}`,
        lastName: `User`,
        role: "CUSTOMER",
        referralCode: generateReferralCode(),
        pointsBalance: Math.floor(Math.random() * 20000),
        isVerified: true,
        referredBy:
          i > 25 && customers.length > 0
            ? customers[Math.floor(Math.random() * customers.length)]?.id
            : undefined,
      },
    });
    customers.push(customer);
  }

  // Create events
  const categories = [
    "Technology",
    "Music",
    "Sports",
    "Business",
    "Art",
    "Food & Culinary",
    "Health & Wellness",
    "Education",
    "Fashion",
    "Gaming",
  ];
  const locations = [
    "Jakarta Convention Center, Jakarta",
    "Bali International Convention Centre, Bali",
    "Surabaya Convention Hall, Surabaya",
    "Bandung Creative Hub, Bandung",
    "Yogyakarta Cultural Center, Yogyakarta",
    "Medan Business Center, Medan",
    "Makassar Event Hall, Makassar",
    "Semarang Expo Center, Semarang",
    "Palembang Convention Center, Palembang",
    "Malang Creative Space, Malang",
  ];

  const events = [];
  for (let i = 1; i <= 80; i++) {
    const organizer = organizers[Math.floor(Math.random() * organizers.length)];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const isFree = Math.random() > 0.6;
    const basePrice = isFree ? 0 : Math.floor(Math.random() * 500000) + 50000;

    const eventDate = new Date();
    eventDate.setDate(
      eventDate.getDate() + Math.floor(Math.random() * 120) + 1
    );

    const availableSeats = Math.floor(Math.random() * 500) + 100;
    const bookedSeats = Math.floor(Math.random() * (availableSeats * 0.3));

    const event = await db.event.create({
      data: {
        name: `${category} Summit ${i} - Innovation & Future Trends`,
        description: `Join us for an exciting ${category.toLowerCase()} event featuring industry leaders, innovative workshops, and networking opportunities. This comprehensive summit will cover the latest trends, technologies, and best practices in ${category.toLowerCase()}. Perfect for professionals, enthusiasts, and anyone looking to expand their knowledge and network in this dynamic field.`,
        price: basePrice,
        date: eventDate,
        time: `${Math.floor(Math.random() * 8) + 9}:00`,
        location: locations[Math.floor(Math.random() * locations.length)],
        category,
        availableSeats,
        bookedSeats,
        status:
          Math.random() > 0.15
            ? "PUBLISHED"
            : Math.random() > 0.5
            ? "DRAFT"
            : "COMPLETED",
        isFree,
        organizerId: organizer.id,
        imageUrl: `/placeholder.svg?height=400&width=600&query=${category.toLowerCase()} conference summit`,
      },
    });
    events.push(event);

    // Create tickets for each event
    const ticketTypes = ["REGULAR", "VIP", "EARLY_BIRD"] as const;
    for (const ticketType of ticketTypes) {
      let ticketPrice = basePrice;
      let ticketQuantity = Math.floor(availableSeats / 3);

      if (ticketType === "VIP") {
        ticketPrice = Math.floor(basePrice * 1.8);
        ticketQuantity = Math.floor(availableSeats * 0.2);
      }
      if (ticketType === "EARLY_BIRD") {
        ticketPrice = Math.floor(basePrice * 0.7);
        ticketQuantity = Math.floor(availableSeats * 0.3);
      }

      await db.ticket.create({
        data: {
          eventId: event.id,
          type: ticketType,
          price: ticketPrice,
          quantity: ticketQuantity,
          sold: Math.floor(Math.random() * Math.min(ticketQuantity * 0.4, 20)),
          description: `${ticketType} ticket with ${
            ticketType === "VIP"
              ? "premium seating, welcome drink, networking lunch, and exclusive access"
              : ticketType === "EARLY_BIRD"
              ? "discounted price for early registration"
              : "standard access to all sessions and materials"
          }`,
        },
      });
    }

    // Create promotions for some events (40% chance)
    if (Math.random() > 0.6) {
      const promoStart = new Date();
      const promoEnd = new Date(eventDate);
      promoEnd.setDate(promoEnd.getDate() - Math.floor(Math.random() * 14) - 1);

      if (promoEnd > promoStart) {
        await db.promotion.create({
          data: {
            eventId: event.id,
            name: `Early Bird Special - ${event.name}`,
            description:
              "Limited time discount for early registration. Don't miss out!",
            discountPercent: Math.floor(Math.random() * 25) + 10,
            maxUses: Math.floor(Math.random() * 100) + 20,
            currentUses: Math.floor(Math.random() * 15),
            startDate: promoStart,
            endDate: promoEnd,
            isActive: true,
          },
        });
      }
    }
  }

  // Create transactions
  for (let i = 1; i <= 150; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const event = events[Math.floor(Math.random() * events.length)];

    if (event.status === "PUBLISHED" || event.status === "COMPLETED") {
      const tickets = await db.ticket.findMany({
        where: { eventId: event.id },
      });

      if (tickets.length > 0) {
        const selectedTicket =
          tickets[Math.floor(Math.random() * tickets.length)];
        const quantity = Math.floor(Math.random() * 3) + 1;
        const totalAmount = selectedTicket.price * quantity;
        const discountAmount =
          Math.random() > 0.7 ? Math.floor(totalAmount * 0.15) : 0;
        const pointsUsed =
          Math.random() > 0.8 ? Math.floor(Math.random() * 10000) : 0;
        const finalAmount = Math.max(
          0,
          totalAmount - discountAmount - pointsUsed
        );

        const transaction = await db.transaction.create({
          data: {
            userId: customer.id,
            eventId: event.id,
            totalAmount,
            discountAmount,
            finalAmount,
            pointsUsed,
            status: "COMPLETED",
            paymentMethod: ["Credit Card", "Bank Transfer", "E-Wallet"][
              Math.floor(Math.random() * 3)
            ],
          },
        });

        await db.transactionItem.create({
          data: {
            transactionId: transaction.id,
            ticketId: selectedTicket.id,
            quantity,
            unitPrice: selectedTicket.price,
            totalPrice: selectedTicket.price * quantity,
          },
        });

        // Update ticket sold count
        await db.ticket.update({
          where: { id: selectedTicket.id },
          data: { sold: { increment: quantity } },
        });

        // Update event booked seats
        await db.event.update({
          where: { id: event.id },
          data: { bookedSeats: { increment: quantity } },
        });
      }
    }
  }

  // Create reviews for completed events
  const completedEvents = events.filter(
    (event) => event.status === "COMPLETED" || event.date < new Date()
  );
  for (const event of completedEvents.slice(0, 30)) {
    const eventTransactions = await db.transaction.findMany({
      where: { eventId: event.id, status: "COMPLETED" },
      take: Math.floor(Math.random() * 8) + 2,
    });

    for (const transaction of eventTransactions) {
      if (Math.random() > 0.3) {
        const rating = Math.floor(Math.random() * 3) + 3; // 3-5 stars (mostly positive)
        const comments = [
          "Amazing event! Great speakers and excellent organization. Would definitely attend again.",
          "Very informative and well-structured. The networking opportunities were fantastic.",
          "Exceeded my expectations. The content was relevant and the venue was perfect.",
          "Good event overall. Learned a lot and met interesting people in the industry.",
          "Professional organization and high-quality content. Worth every penny!",
          "Inspiring speakers and great atmosphere. The workshops were particularly valuable.",
          "Well-organized event with excellent facilities. The food was also great!",
          "Fantastic experience! The event provided great insights and networking opportunities.",
        ];

        await db.review.create({
          data: {
            userId: transaction.userId,
            eventId: event.id,
            rating,
            comment: comments[Math.floor(Math.random() * comments.length)],
          },
        });
      }
    }
  }

  // Create points for users
  for (const customer of customers.slice(0, 35)) {
    const pointsCount = Math.floor(Math.random() * 6) + 1;
    for (let i = 0; i < pointsCount; i++) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 3);

      const pointAmount = Math.floor(Math.random() * 15000) + 1000;
      const descriptions = [
        "Referral bonus",
        "Event purchase reward",
        "Registration bonus",
        "Loyalty reward",
        "Special promotion bonus",
      ];

      await db.point.create({
        data: {
          earnedById: customer.id,
          amount: pointAmount,
          description:
            descriptions[Math.floor(Math.random() * descriptions.length)],
          expiresAt,
          isUsed: Math.random() > 0.6,
        },
      });
    }
  }

  // Create discount coupons
  for (const customer of customers.slice(0, 25)) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);

    await db.discountCoupon.create({
      data: {
        userId: customer.id,
        code: `DISC${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        discountPercent: [10, 15, 20][Math.floor(Math.random() * 3)],
        isUsed: Math.random() > 0.5,
        expiresAt,
      },
    });
  }

  console.log("✅ Database seeded successfully!");
  console.log(`Created:`);
  console.log(`- ${organizers.length} organizers`);
  console.log(`- ${customers.length} customers`);
  console.log(`- ${events.length} events`);
  console.log(`- ${events.length * 3} tickets (3 per event)`);
  console.log(`- 150 transactions`);
  console.log(`- Reviews for completed events`);
  console.log(`- Points and discount coupons`);
  console.log(`- Promotions for selected events`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
