import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing in .env");

  try {
    await mongoose.connect(uri, {
      dbName: "ChatSaathi",
      tls: true,
      tlsAllowInvalidCertificates: true, // 👈 important line
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}
