// src/routes/search.routes.js
import express from "express";
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";
import { authRequired } from "../middleware/auth.js";

export const searchRouter = express.Router();

// GET /api/search/messages?q=...
searchRouter.get("/messages", authRequired, async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);

    const userId = req.user._id;

    const userConversations = await Conversation.find(
      { members: userId },
      "_id"
    );
    const convoIds = userConversations.map((c) => c._id);

    const messages = await Message.find({
      conversation: { $in: convoIds },
      text: { $regex: q, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("sender", "displayName username")
      .populate("conversation", "name type");

    res.json(messages);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
