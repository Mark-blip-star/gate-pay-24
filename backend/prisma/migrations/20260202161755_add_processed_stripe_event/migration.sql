-- CreateTable
CREATE TABLE "processedStripeEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processedStripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processedStripeEvent_eventId_key" ON "processedStripeEvent"("eventId");

-- CreateIndex
CREATE INDEX "processedStripeEvent_eventId_idx" ON "processedStripeEvent"("eventId");
