// src/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { connectDB } from "./config/db.js";
import { authRouter } from "./routes/auth.routes.js";
import { conversationRouter } from "./routes/conversation.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import { registerChatHandlers } from "./sockets/chatSocket.js";
import { messageModifyRouter } from "./routes/message.modify.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { readRouter } from "./routes/read.routes.js"; // ✅ added
import { profileRouter } from "./routes/profile.routes.js";

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

async function start() {
  await connectDB();

  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: CORS_ORIGIN,
      credentials: true,
    },
  });

  // Make io available to routes using req.app.get("io")
  app.set("io", io); // ✅ moved above routes

  app.use(
    cors({
      origin: CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ status: "Chat Saathi backend running" });
  });

  // REST API routes
  app.use("/api/auth", authRouter);
  app.use("/api/conversations", conversationRouter);
  app.use("/api/messages", messageRouter);         // /send etc.
  app.use("/api/messages", messageModifyRouter);   // /:id edit/delete
  app.use("/api/read", readRouter);                // ✅ mark-as-read
  app.use("/api/search", searchRouter);
  app.use("/api/profile", profileRouter);

  // Socket handlers
  registerChatHandlers(io);

  server.listen(PORT, () => {
    console.log(`🚀 Backend listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
