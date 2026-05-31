import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    success: true,
    status: "healthy",
    env: process.env.NODE_ENV || "development",
    message: "Queless backend is healthy",
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
