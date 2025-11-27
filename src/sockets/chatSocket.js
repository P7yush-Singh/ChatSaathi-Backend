// src/sockets/chatSocket.js
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";
import { User } from "../models/User.js";
import jwt from "jsonwebtoken";

export function registerChatHandlers(io) {
  // userId (string) -> socketId
  const onlineUsers = new Map();

  // Socket auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No auth token"));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.userId;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId?.toString();

    // Track online user
    onlineUsers.set(userId, socket.id);

    // Broadcast full online list + this user's presence
    io.emit("user:online:list", Array.from(onlineUsers.keys()));
    io.emit("user:presence", {
      userId,
      online: true,
      lastSeen: null,
    });

    // Join conversation rooms
    socket.on("conversation:join", (conversationId) => {
      if (!conversationId) return;
      socket.join(conversationId);
    });

    // Typing start
    socket.on("typing:start", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(conversationId).emit("typing:start", {
        conversationId,
        userId,
      });
    });

    // Typing stop
    socket.on("typing:stop", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(conversationId).emit("typing:stop", {
        conversationId,
        userId,
      });
    });

    // ✅ Presence check (for tabs that mount later)
    socket.on("presence:check", async ({ userId: targetId }) => {
      try {
        if (!targetId) return;

        const key = targetId.toString();
        const isOnline = onlineUsers.has(key);

        let lastSeen = null;
        if (!isOnline) {
          const userDoc = await User.findById(targetId).select("lastSeen");
          lastSeen = userDoc?.lastSeen || null;
        }

        socket.emit("presence:state", {
          userId: targetId,
          online: isOnline,
          lastSeen,
        });
      } catch (err) {
        console.error("presence:check error:", err.message);
      }
    });

    // New message (real-time)
    socket.on("message:new", async ({ conversationId, text }) => {
      try {
        if (!conversationId || !text) return;

        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          text,
          readBy: [userId], // sender has read it
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessageAt: new Date(),
        });

        const populated = await message.populate(
          "sender",
          "displayName username avatarUrl"
        );

        // Broadcast to everyone in that conversation (including sender)
        io.to(conversationId).emit("message:new", populated);
      } catch (err) {
        console.error("Socket message:new error:", err.message);
      }
    });

    // Disconnect: update lastSeen + broadcast presence
    socket.on("disconnect", async () => {
      onlineUsers.delete(userId);
      io.emit("user:online:list", Array.from(onlineUsers.keys()));

      try {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { lastSeen });

        io.emit("user:presence", {
          userId,
          online: false,
          lastSeen,
        });
      } catch (e) {
        console.error("Error updating lastSeen:", e.message);
      }
    });
  });
}
