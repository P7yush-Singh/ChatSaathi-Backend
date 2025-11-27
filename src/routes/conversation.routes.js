// src/routes/conversation.routes.js
import express from "express";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { authRequired } from "../middleware/auth.js";

export const conversationRouter = express.Router();

function isAdmin(convo, userId) {
  return convo.admins.some((a) => a.toString() === userId.toString());
}

/**
 * GET /api/conversations
 * Get all conversations where current user is a member
 */
conversationRouter.get("/", authRequired, async (req, res) => {
  try {
    const userId = req.user._id;

    const convos = await Conversation.find({ members: userId })
      .sort({ updatedAt: -1 })
      .populate("members", "displayName username avatarUrl");

    res.json(convos);
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/conversations/group
 * Create a new group conversation
 * body: { name, usernames: ["piyush", "rahul", ...] }
 * Creator will always be admin + member.
 */
conversationRouter.post("/group", authRequired, async (req, res) => {
  try {
    const { name, usernames = [] } = req.body;
    const creatorId = req.user._id;

    if (!name) {
      return res.status(400).json({ message: "Group name is required" });
    }

    // Find users by username
    const normalized = usernames
      .filter(Boolean)
      .map((u) => u.trim().toLowerCase());

    const users =
      normalized.length > 0
        ? await User.find({ username: { $in: normalized } }, "_id")
        : [];

    const memberIds = users.map((u) => u._id.toString());

    // make sure creator is included + remove duplicates
    const members = Array.from(
      new Set([...memberIds, creatorId.toString()])
    );

    let convo = await Conversation.create({
      type: "group",
      name: name.trim(),
      members,
      admins: [creatorId],
      lastMessageAt: new Date(),
    });

    convo = await convo.populate("members", "displayName username avatarUrl");

    res.status(201).json(convo);
  } catch (err) {
    console.error("Create group error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /api/conversations/:id/group-name
 * Admin can change group name
 * body: { name }
 */
conversationRouter.patch(
  "/:id/group-name",
  authRequired,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const userId = req.user._id;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const convo = await Conversation.findById(id);
      if (!convo) return res.status(404).json({ message: "Not found" });
      if (convo.type !== "group") {
        return res.status(400).json({ message: "Not a group conversation" });
      }

      if (!isAdmin(convo, userId)) {
        return res.status(403).json({ message: "Only admins can rename group" });
      }

      convo.name = name.trim();
      await convo.save();

      res.json(convo);
    } catch (err) {
      console.error("Rename group error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /api/conversations/:id/members/add
 * Admin can add members by usernames
 * body: { usernames: ["user1", "user2"] }
 */
conversationRouter.post(
  "/:id/members/add",
  authRequired,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { usernames = [] } = req.body;
      const userId = req.user._id;

      const convo = await Conversation.findById(id);
      if (!convo) return res.status(404).json({ message: "Not found" });
      if (convo.type !== "group") {
        return res.status(400).json({ message: "Not a group conversation" });
      }

      if (!isAdmin(convo, userId)) {
        return res
          .status(403)
          .json({ message: "Only admins can add members" });
      }

      const normalized = usernames
        .filter(Boolean)
        .map((u) => u.trim().toLowerCase());

      const users = await User.find({ username: { $in: normalized } }, "_id");
      const newIds = users.map((u) => u._id.toString());

      convo.members = Array.from(
        new Set([...convo.members.map((m) => m.toString()), ...newIds])
      );

      await convo.save();

      const populated = await convo.populate(
        "members",
        "displayName username avatarUrl"
      );

      res.json(populated);
    } catch (err) {
      console.error("Add members error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /api/conversations/:id/members/remove
 * Admin can remove member by username
 * body: { username }
 * (also removes from admins if they are admin)
 */
conversationRouter.post(
  "/:id/members/remove",
  authRequired,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { username } = req.body;
      const userId = req.user._id;

      const convo = await Conversation.findById(id);
      if (!convo) return res.status(404).json({ message: "Not found" });
      if (convo.type !== "group") {
        return res.status(400).json({ message: "Not a group conversation" });
      }

      if (!isAdmin(convo, userId)) {
        return res
          .status(403)
          .json({ message: "Only admins can remove members" });
      }

      const user = await User.findOne({
        username: username?.trim().toLowerCase(),
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const targetId = user._id.toString();

      // admin cannot remove themselves with this endpoint
      // (they can leave group later with another endpoint if you want)
      convo.members = convo.members.filter(
        (m) => m.toString() !== targetId
      );
      convo.admins = convo.admins.filter(
        (a) => a.toString() !== targetId
      );

      await convo.save();

      const populated = await convo.populate(
        "members",
        "displayName username avatarUrl"
      );

      res.json(populated);
    } catch (err) {
      console.error("Remove member error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /api/conversations/:id/admins/add
 * Make a member admin (creator/admin only)
 * body: { username }
 */
conversationRouter.post(
  "/:id/admins/add",
  authRequired,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { username } = req.body;
      const userId = req.user._id;

      const convo = await Conversation.findById(id);
      if (!convo) return res.status(404).json({ message: "Not found" });
      if (convo.type !== "group") {
        return res.status(400).json({ message: "Not a group conversation" });
      }

      if (!isAdmin(convo, userId)) {
        return res
          .status(403)
          .json({ message: "Only admins can make admins" });
      }

      const user = await User.findOne({
        username: username?.trim().toLowerCase(),
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const targetId = user._id.toString();

      // must be a member first
      if (
        !convo.members.some((m) => m.toString() === targetId)
      ) {
        return res
          .status(400)
          .json({ message: "User must be a member to become admin" });
      }

      if (!convo.admins.some((a) => a.toString() === targetId)) {
        convo.admins.push(targetId);
        await convo.save();
      }

      res.json(convo);
    } catch (err) {
      console.error("Add admin error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /api/conversations/:id/admins/remove
 * Remove admin role from a user (must keep at least 1 admin)
 * body: { username }
 */
conversationRouter.post(
  "/:id/admins/remove",
  authRequired,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { username } = req.body;
      const userId = req.user._id;

      const convo = await Conversation.findById(id);
      if (!convo) return res.status(404).json({ message: "Not found" });
      if (convo.type !== "group") {
        return res.status(400).json({ message: "Not a group conversation" });
      }

      if (!isAdmin(convo, userId)) {
        return res
          .status(403)
          .json({ message: "Only admins can remove admins" });
      }

      const user = await User.findOne({
        username: username?.trim().toLowerCase(),
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const targetId = user._id.toString();

      // can't remove the last admin
      const currentAdmins = convo.admins.map((a) => a.toString());
      if (
        currentAdmins.length === 1 &&
        currentAdmins[0] === targetId
      ) {
        return res
          .status(400)
          .json({ message: "Group must have at least one admin" });
      }

      convo.admins = convo.admins.filter(
        (a) => a.toString() !== targetId
      );
      await convo.save();

      res.json(convo);
    } catch (err) {
      console.error("Remove admin error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /api/conversations/dm-by-username
 * Create (or get) a DM with another user by username
 * body: { username }
 */
conversationRouter.post("/dm-by-username", authRequired, async (req, res) => {
  try {
    const meId = req.user._id;
    let { username } = req.body;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    username = username.trim().toLowerCase();

    const other = await User.findOne({ username });
    if (!other) {
      return res.status(404).json({ message: "User not found" });
    }

    if (other._id.toString() === meId.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot create a chat with yourself" });
    }

    let convo = await Conversation.findOne({
      type: "dm",
      members: { $all: [meId, other._id] },
    }).populate("members", "displayName username avatarUrl");

    if (!convo) {
      convo = await Conversation.create({
        type: "dm",
        members: [meId, other._id],
        admins: [],
        lastMessageAt: new Date(),
      });

      convo = await convo.populate(
        "members",
        "displayName username avatarUrl"
      );
    }

    res.status(201).json(convo);
  } catch (err) {
    console.error("Create DM error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/conversations/:id
// Return single conversation with members populated
conversationRouter.get("/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    let convo = await Conversation.findById(id)
      .populate("members", "displayName username avatarUrl")
      .populate("admins", "_id"); // just ids

    if (!convo) {
      return res.status(404).json({ message: "Not found" });
    }

    const isMember = convo.members.some(
      (m) => m._id.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ message: "You are not a member of this conversation" });
    }

    res.json(convo);
  } catch (err) {
    console.error("Get conversation meta error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/**
 * GET /api/conversations/:id/messages
 * Get messages for a conversation (with membership check)
 */
conversationRouter.get("/:id/messages", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Number(req.query.limit) || 50;

    const convo = await Conversation.findById(id);
    if (!convo) {
      return res.status(404).json({ message: "Not found" });
    }

    const isMember = convo.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ message: "You are not a member of this conversation" });
    }

    const messages = await Message.find({ conversation: id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "displayName username avatarUrl");

    res.json(messages.reverse());
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
