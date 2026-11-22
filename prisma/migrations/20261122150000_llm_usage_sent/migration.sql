-- Which recorded Claude runs have been sent to Nasiko's usage intake (so each is sent once, and a failed send is retried).
ALTER TABLE "LlmUsage" ADD COLUMN "sentToNasiko" BOOLEAN NOT NULL DEFAULT false;
