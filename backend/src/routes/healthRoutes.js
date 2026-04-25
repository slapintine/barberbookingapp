import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    message: "Backend is running",
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
