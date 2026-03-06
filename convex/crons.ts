import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "requeue stale transcode jobs",
  { seconds: 30 },
  internal.transcodeQueue.requeueStaleJobs,
);

crons.interval(
  "cleanup stale multipart uploads",
  { hours: 6 },
  internal.videoActions.cleanupStaleMultipartUploads,
  {
    maxAgeHours: 48,
    prefix: "videos/",
  },
);

crons.interval(
  "auto purge inactive projects",
  { hours: 24 },
  internal.projects.autoPurgeInactiveProjects,
  {
    olderThanDays: 180,
    limit: 200,
  },
);

export default crons;
