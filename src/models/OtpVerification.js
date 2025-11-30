// src/models/OtpVerification.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const otpVerificationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true }, // for dev you can keep plain text
    purpose: { type: String, default: "signup" },
    data: {
      // pending user data until OTP is verified
      displayName: String,
      username: String,
      email: String,
      passwordHash: String,
      avatarUrl: String,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

otpVerificationSchema.index({ email: 1, purpose: 1 });

export const OtpVerification = mongoose.model(
  "OtpVerification",
  otpVerificationSchema
);
