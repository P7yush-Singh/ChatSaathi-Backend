// src/routes/auth.routes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { authRequired } from "../middleware/auth.js";

export const authRouter = express.Router();

// POST /api/auth/register
authRouter.post("/register", async (req, res) => {
  try {
    const { displayName, username, email, password } = req.body;

    if (!displayName || !username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser =
      (await User.findOne({ email })) || (await User.findOne({ username }));
    if (existingUser) {
      return res.status(409).json({ message: "Email or username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      displayName,
      username,
      email,
      passwordHash,
      isVerified: true, // for now true; later OTP will flip this
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    user.lastSeen = new Date();
    await user.save();

    res.json({
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// New 
// GET /api/auth/me
authRouter.get("/me", authRequired, async (req, res) => {
  const user = req.user;
  res.json({
    user: {
      id: user._id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
});
