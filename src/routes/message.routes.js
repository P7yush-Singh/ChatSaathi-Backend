// src/routes/message.routes.js
import express from "express";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { authRequired } from "../middleware/auth.js";

export const messageRouter = express.Router();

// POST /api/messages/send
messageRouter.post("/send", authRequired, async (req, res) => {
  try {
    const { conversationId, text } = req.body;

    if (!conversationId || !text) {
      return res
        .status(400)
        .json({ message: "conversationId and text are required" });
    }

    const convo = await Conversation.findById(conversationId);
    if (!convo) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Only members can send
    if (!convo.members.some((m) => m.toString() === req.user._id.toString())) {
      return res
        .status(403)
        .json({ message: "You are not a member of this conversation" });
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      text,
      readBy: [req.user._id],
    });

    convo.lastMessageAt = new Date();
    await convo.save();

    const populated = await message.populate(
      "sender",
      "displayName username avatarUrl"
    );

    res.status(201).json(populated);
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
