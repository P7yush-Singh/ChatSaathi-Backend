// src/routes/read.routes.js
import express from "express";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { authRequired } from "../middleware/auth.js";

export const readRouter = express.Router();

// POST /api/read/conversation/:id
// Marks all messages in a conversation as read by current user
readRouter.post("/conversation/:id", authRequired, async (req, res) => {
  try {
    const convoId = req.params.id;
    const userId = req.user._id;

    const convo = await Conversation.findById(convoId);
    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    const isMember = convo.members.some(
      (m) => m.toString() === userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: "Not a member of this conversation" });
    }

    // Add user to readBy for all messages in this conversation
    await Message.updateMany(
      {
        conversation: convoId,
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
      }
    );

    // Emit socket event so sender can update ticks
    const io = req.app.get("io");
    if (io) {
      io.to(convoId).emit("conversation:read", {
        conversationId: convoId,
        userId,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
