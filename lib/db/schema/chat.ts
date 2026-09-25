import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";
import { channelKind, messageStatus } from "./enums";

export const chatChannels = pgTable(
  "chat_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    kind: channelKind("kind").notNull().default("custom"),
    // Stable sorted user-id pair for a one-to-one direct conversation.
    directKey: text("direct_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("chat_channels_project_name_uq").on(t.projectId, t.name),
    uniqueIndex("chat_channels_direct_key_uq").on(t.directKey),
  ]
);

/** Membership is enforced for direct and custom team channels at every boundary. */
export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("chat_channel_members_unique").on(t.channelId, t.userId),
    index("chat_channel_members_user_idx").on(t.userId, t.channelId),
  ]
);

export const projectChatPins = pgTable(
  "project_chat_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("project_chat_pins_unique").on(t.projectId, t.userId),
    index("project_chat_pins_user_idx").on(t.userId, t.createdAt),
  ]
);

/** id is a UUID v7 generated in app (time-sortable → doubles as the cursor). */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    content: text("content"),
    status: messageStatus("status").notNull().default("sent"),
    clientNonce: text("client_nonce"),
    replyToId: uuid("reply_to_id"),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Bumped on status/edit/delete/attach so realtime can detect any change.
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("chat_messages_channel_idx").on(t.channelId, t.id)]
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("message_reactions_unique").on(t.messageId, t.userId, t.emoji),
  ]
);

export const channelReads = pgTable(
  "channel_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadMessageId: uuid("last_read_message_id"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("channel_reads_unique").on(t.channelId, t.userId)]
);
