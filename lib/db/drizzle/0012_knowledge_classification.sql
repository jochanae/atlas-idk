-- Milestone 2.2 — Knowledge Classification
-- First-class types: Question (unresolved) + EngineeringEvent (activity, not Ledger)
ALTER TYPE "public"."object_type" ADD VALUE IF NOT EXISTS 'Question';
--> statement-breakpoint
ALTER TYPE "public"."object_type" ADD VALUE IF NOT EXISTS 'EngineeringEvent';
