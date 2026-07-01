import express from "express";
import { env } from "../config/env.js";
import { buildAppVersionResponse } from "../services/appVersionService.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(buildAppVersionResponse(env));
});

export default router;
