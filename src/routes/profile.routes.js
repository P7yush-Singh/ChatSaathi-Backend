// src/routes/profile.routes.js
import express from "express";
import { authRequired } from "../middleware/auth.js";
import { User } from "../models/User.js";

export const profileRouter = express.Router();

// GET /api/profile/me
profileRouter.get("/me", authRequired, async (req, res) => {
  const u = req.user;
  res.json({
    id: u._id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    usernameLastChanged: u.usernameLastChanged,
  });
});

// PATCH /api/profile  (displayName + avatarUrl)
profileRouter.patch("/", authRequired, async (req, res) => {
  try {
    const { displayName, avatarUrl } = req.body;
    const userId = req.user._id;

    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;

    const updated = await User.findByIdAndUpdate(userId, update, {
      new: true,
    }).select(
      "email username displayName avatarUrl usernameLastChanged"
    );

    res.json(updated);
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/profile/username  (14 days + availability)
profileRouter.patch("/username", authRequired, async (req, res) => {
  try {
    let { username } = req.body;
    const userId = req.user._id;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    username = username.trim().toLowerCase();

    const user = await User.findById(userId).select(
      "username usernameLastChanged createdAt"
    );

    const now = Date.now();
    const lastChanged =
      user.usernameLastChanged || user.createdAt || new Date(0);
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

    if (now - new Date(lastChanged).getTime() < FOURTEEN_DAYS) {
      const nextChange = new Date(
        new Date(lastChanged).getTime() + FOURTEEN_DAYS
      );
      return res.status(400).json({
        message:
          "You can change your username only once in 14 days.",
        nextAllowedAt: nextChange,
      });
    }

    const exists = await User.findOne({
      username,
      _id: { $ne: userId },
    }).lean();

    if (exists) {
      return res
        .status(400)
        .json({ message: "This username is already taken." });
    }

    user.username = username;
    user.usernameLastChanged = new Date();
    await user.save();

    res.json({
      id: user._id,
      username: user.username,
      usernameLastChanged: user.usernameLastChanged,
    });
  } catch (err) {
    console.error("Change username error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
