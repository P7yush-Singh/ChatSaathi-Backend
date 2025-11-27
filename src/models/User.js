// src/models/User.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
    },
    displayName: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    usernameLastChanged: {
      type: Date,
      default: Date.now, // treat signup as first set
    },
    avatarUrl: {
      type: String,
    },
    lastSeen: {
      type: Date,
    },
    // ... any other fields you already had
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
