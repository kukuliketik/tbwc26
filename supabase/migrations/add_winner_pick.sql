-- Run this in Supabase SQL Editor to add the WinnerPick table

CREATE TABLE "WinnerPick" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WinnerPick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WinnerPick_userId_key" ON "WinnerPick"("userId");

ALTER TABLE "WinnerPick" ADD CONSTRAINT "WinnerPick_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
