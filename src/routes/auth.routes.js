// src/routes/auth.routes.js

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { authRequired } from "../middleware/auth.js";
import { Resend } from "resend";
import { OtpVerification } from "../models/OtpVerification.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "no-reply@chatsaathi.in";

export const authRouter = express.Router();

// [your existing routes kept unchanged...]
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

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || process.env.JWT_SECERT, {
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

// POST /api/auth/register/start
authRouter.post("/register/start", async (req, res) => {
  try {
    const { displayName, username, email, password } = req.body;

    if (!displayName || !username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    // Check if user/username already exists
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    }).lean();

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Email or username already in use" });
    }

    // Hash password (we keep it in temp storage until OTP verified)
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Upsert OTP entry for this email
    await OtpVerification.findOneAndUpdate(
      { email: normalizedEmail, purpose: "signup" },
      {
        email: normalizedEmail,
        code,
        purpose: "signup",
        data: {
          displayName,
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          avatarUrl: null, // we'll add avatar later
        },
        expiresAt,
      },
      { upsert: true, new: true }
    );

    // Send OTP email via Resend
    await resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: "Your Chat Saathi verification code",
      html: `
        <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height:1.6;">
          <h2>Verify your email for Chat Saathi</h2>
          <p>Use this code to complete your signup:</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
          <p>This code will expire in 15 minutes.</p>
        </div>
      `,
    });

    res.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.error("register/start error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/register/verify
authRouter.post("/register/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const record = await OtpVerification.findOne({
      email: normalizedEmail,
      purpose: "signup",
    });

    if (!record) {
      return res.status(400).json({ message: "No verification request found" });
    }

    if (record.expiresAt < new Date()) {
      await record.deleteOne();
      return res.status(400).json({ message: "OTP has expired" });
    }

    if (record.code !== otp.trim()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Create user from stored data
    const { displayName, username, passwordHash, avatarUrl } = record.data;

    // Double-check user does not exist
    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { username }],
    }).lean();
    if (existing) {
      await record.deleteOne();
      return res
        .status(400)
        .json({ message: "User already exists. Try logging in." });
    }

    const user = await User.create({
      email: normalizedEmail,
      displayName,
      username,
      passwordHash,
      avatarUrl: avatarUrl || null,
      usernameLastChanged: new Date(),
    });

    // Cleanup OTP record
    await record.deleteOne();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || process.env.JWT_SECERT,
      { expiresIn: "7d" }
    );

    // (You can also set cookie here if you want)
    // res.cookie("token", token, { ... });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("register/verify error:", err);
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

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || process.env.JWT_SECERT, {
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

/**
 * NEW: POST /api/auth/oauth-login
 * Called by frontend oauth-callback page after NextAuth signs in with Google.
 * It creates the user if not exists and returns your app JWT + user.
 */
authRouter.post("/oauth-login", async (req, res) => {
  try {
    const { provider, providerId, email, displayName, avatarUrl } = req.body;

    if (!email) return res.status(400).json({ message: "Email required" });

    const normalizedEmail = String(email).trim().toLowerCase();

    // Try find by oauth provider id (if stored) or by email
    let user =
      (providerId &&
        (await User.findOne({ "oauth.provider": provider, "oauth.id": providerId }).exec())) ||
      (await User.findOne({ email: normalizedEmail }).exec());

    if (!user) {
      // Auto-create user — generate safe unique username from displayName or email local part
      let base = (displayName || normalizedEmail.split("@")[0] || "user")
        .replace(/\s+/g, "")
        .toLowerCase()
        .slice(0, 16);

      // make unique
      let candidate = base;
      let i = 0;
      while (await User.exists({ username: candidate })) {
        i += 1;
        candidate = `${base}${i}`;
      }

      user = new User({
        email: normalizedEmail,
        displayName: displayName || candidate,
        username: candidate,
        avatarUrl: avatarUrl || null,
        oauth: { provider, id: providerId },
        usernameLastChanged: new Date(),
      });

      await user.save();
    } else {
      // if user exists but oauth data missing, save it
      if (providerId && (!user.oauth || !user.oauth.id)) {
        user.oauth = user.oauth || {};
        user.oauth.provider = provider;
        user.oauth.id = providerId;
        await user.save();
      }
    }

    // create your backend JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || process.env.JWT_SECERT,
      { expiresIn: "7d" }
    );

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
    console.error("oauth-login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default authRouter;