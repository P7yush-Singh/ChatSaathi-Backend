// models/Conversation.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["dm", "group"],
      default: "dm",
    },
    name: {
      type: String,
      trim: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastMessageAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
