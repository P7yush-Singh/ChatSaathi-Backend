// src/routes/message.modify.routes.js
import express from "express";
import { Message } from "../models/Message.js";
import { authRequired } from "../middleware/auth.js";

export const messageModifyRouter = express.Router();

// PATCH /api/messages/:id
messageModifyRouter.patch("/:id", authRequired, async (req, res) => {
  try {
    const msgId = req.params.id;
    const { text } = req.body;
    const userId = req.user._id;

    const msg = await Message.findById(msgId);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    if (msg.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Cannot edit this message" });
    }

    msg.text = text;
    await msg.save();

    const io = req.app.get("io");
    io.to(msg.conversation.toString()).emit("message:edit", msg);

    res.json(msg);
  } catch (err) {
    console.error("Edit message error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/messages/:id
messageModifyRouter.delete("/:id", authRequired, async (req, res) => {
  try {
    const msgId = req.params.id;
    const userId = req.user._id;

    const msg = await Message.findById(msgId);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    if (msg.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Cannot delete this message" });
    }

    msg.text = "This message was deleted";
    msg.isDeleted = true;
    await msg.save();

    const io = req.app.get("io");
    io.to(msg.conversation.toString()).emit("message:delete", msg);

    res.json({ ok: true });
  } catch (err) {
    console.error("Delete message error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
