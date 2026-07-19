import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    ok: true,
    success: true,
    status: "healthy",
    message: "Queless backend is healthy",
    uptime_seconds: process.uptime(),
    memory: {
      rss_mb: Math.round(memory.rss / 1024 / 1024),
      heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
