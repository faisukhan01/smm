/**
 * SMM Shared — single source of truth for domain types, plan limits,
 * platform capabilities and API contracts. Used by the web app, the
 * NestJS API and the publishing worker.
 */

// ---------------------------------------------------------------------------
// Enums (mirror prisma/schema.prisma)
// ---------------------------------------------------------------------------

export const USER_ROLES = ["OWNER", "ADMIN", "MANAGER", "EDITOR", "VIEWER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PLATFORMS = ["FACEBOOK", "INSTAGRAM", "PINTEREST"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const ACCOUNT_STATUSES = ["CONNECTED", "EXPIRED", "REVOKED", "ERROR"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const POST_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const AI_KINDS = ["CAPTION", "HASHTAGS", "IMAGE", "ASSISTANT", "PLAN", "REPLY_DRAFT"] as const;
export type AiKind = (typeof AI_KINDS)[number];

export const AI_MODES = ["MANUAL", "APPROVAL", "AUTO"] as const;
export type AiMode = (typeof AI_MODES)[number];

export const PLAN_TIERS = ["FREE", "STARTER", "PROFESSIONAL", "AGENCY"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

// ---------------------------------------------------------------------------
// Role permission matrix (enforced server-side, used for UI affordances)
// ---------------------------------------------------------------------------

export type Permission =
  | "workspace:read"
  | "workspace:update"
  | "brand:read"
  | "brand:write"
  | "post:read"
  | "post:draft"
  | "post:edit"
  | "post:approve"
  | "post:schedule"
  | "post:delete"
  | "account:read"
  | "account:connect"
  | "account:disconnect"
  | "inbox:read"
  | "inbox:reply"
  | "ai:use"
  | "analytics:read"
  | "billing:manage"
  | "team:manage"
  | "audit:read";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: [
    "workspace:read", "workspace:update", "brand:read", "brand:write",
    "post:read", "post:draft", "post:edit", "post:approve", "post:schedule", "post:delete",
    "account:read", "account:connect", "account:disconnect",
    "inbox:read", "inbox:reply", "ai:use", "analytics:read",
    "billing:manage", "team:manage", "audit:read",
  ],
  ADMIN: [
    "workspace:read", "workspace:update", "brand:read", "brand:write",
    "post:read", "post:draft", "post:edit", "post:approve", "post:schedule", "post:delete",
    "account:read", "account:connect", "account:disconnect",
    "inbox:read", "inbox:reply", "ai:use", "analytics:read",
    "team:manage", "audit:read",
  ],
  MANAGER: [
    "workspace:read", "brand:read", "brand:write",
    "post:read", "post:draft", "post:edit", "post:approve", "post:schedule",
    "account:read", "account:connect",
    "inbox:read", "inbox:reply", "ai:use", "analytics:read",
  ],
  EDITOR: [
    "workspace:read", "brand:read",
    "post:read", "post:draft", "post:edit",
    "account:read", "inbox:read", "ai:use", "analytics:read",
  ],
  VIEWER: [
    "workspace:read", "brand:read", "post:read", "account:read",
    "inbox:read", "analytics:read",
  ],
};

export function roleHas(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ---------------------------------------------------------------------------
// Plans — configurable limits, never hard-coded in features
// ---------------------------------------------------------------------------

export interface PlanLimits {
  name: string;
  priceMonthly: number;
  description: string;
  maxAccounts: number;
  maxMembers: number;
  maxWorkspaces: number;
  aiCreditsPerMonth: number;
  maxPostsPerMonth: number;
  analyticsHistoryDays: number;
  storageMb: number;
  features: string[];
}

export const PLANS: Record<PlanTier, PlanLimits> = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    description: "Try the essentials and explore AI content creation.",
    maxAccounts: 2,
    maxMembers: 1,
    maxWorkspaces: 1,
    aiCreditsPerMonth: 30,
    maxPostsPerMonth: 20,
    analyticsHistoryDays: 7,
    storageMb: 100,
    features: ["2 social accounts", "30 AI credits / month", "20 posts / month", "7-day analytics history"],
  },
  STARTER: {
    name: "Starter",
    priceMonthly: 12,
    description: "For solo creators and small businesses getting serious.",
    maxAccounts: 5,
    maxMembers: 2,
    maxWorkspaces: 1,
    aiCreditsPerMonth: 200,
    maxPostsPerMonth: 150,
    analyticsHistoryDays: 30,
    storageMb: 1024,
    features: ["5 social accounts", "200 AI credits / month", "150 posts / month", "30-day analytics history", "Content calendar"],
  },
  PROFESSIONAL: {
    name: "Professional",
    priceMonthly: 29,
    description: "For growing teams that publish at scale.",
    maxAccounts: 10,
    maxMembers: 5,
    maxWorkspaces: 2,
    aiCreditsPerMonth: 600,
    maxPostsPerMonth: 600,
    analyticsHistoryDays: 90,
    storageMb: 5120,
    features: ["10 social accounts", "600 AI credits / month", "600 posts / month", "90-day analytics history", "Approval workflows", "Team roles"],
  },
  AGENCY: {
    name: "Agency",
    priceMonthly: 79,
    description: "For agencies managing many brands and clients.",
    maxAccounts: 25,
    maxMembers: 15,
    maxWorkspaces: 10,
    aiCreditsPerMonth: 2000,
    maxPostsPerMonth: 2500,
    analyticsHistoryDays: 365,
    storageMb: 20480,
    features: ["25 social accounts", "2,000 AI credits / month", "2,500 posts / month", "Full analytics history", "Up to 15 team members", "Priority support"],
  },
};

// ---------------------------------------------------------------------------
// Platform capability matrix — grounded in official API documentation.
// Any capability not granted by the platform is surfaced honestly in the UI.
// Verify current requirements at the linked developer portals.
// ---------------------------------------------------------------------------

export interface PlatformCapability {
  key: string;
  label: string;
  supported: boolean;
  note?: string;
}

export interface PlatformMeta {
  platform: Platform;
  name: string;
  docsUrl: string;
  reviewRequired: string;
  accountRequirement: string;
  capabilities: PlatformCapability[];
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  FACEBOOK: {
    platform: "FACEBOOK",
    name: "Facebook Pages",
    docsUrl: "https://developers.facebook.com/docs/pages-api",
    reviewRequired: "pages_show_list, pages_manage_posts, pages_read_engagement, pages_manage_engagement",
    accountRequirement: "A Facebook Page (personal profiles are not supported by the Pages API)",
    capabilities: [
      { key: "publish_text", label: "Publish text posts", supported: true },
      { key: "publish_image", label: "Publish image posts", supported: true },
      { key: "publish_video", label: "Publish video posts", supported: true },
      { key: "insights", label: "Post & page insights", supported: true },
      { key: "comments", label: "Read & reply to comments", supported: true },
      { key: "messaging", label: "Page messaging", supported: true, note: "Requires Messenger Platform permissions" },
    ],
  },
  INSTAGRAM: {
    platform: "INSTAGRAM",
    name: "Instagram Professional",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform",
    reviewRequired: "instagram_basic, instagram_content_publish, instagram_manage_comments, business_management",
    accountRequirement: "Instagram Professional (Business or Creator) account linked to a Facebook Page",
    capabilities: [
      { key: "publish_text", label: "Publish captions", supported: true },
      { key: "publish_image", label: "Publish images & carousels", supported: true, note: "Media must be hosted at a public URL (S3 storage)" },
      { key: "publish_video", label: "Publish Reels & video", supported: true, note: "Via the container publish flow" },
      { key: "insights", label: "Account & media insights", supported: true },
      { key: "comments", label: "Read & reply to comments", supported: true },
      { key: "messaging", label: "Direct messages", supported: false, note: "Not available through the Instagram Platform API" },
    ],
  },
  PINTEREST: {
    platform: "PINTEREST",
    name: "Pinterest",
    docsUrl: "https://developers.pinterest.com/docs/api/v5/",
    reviewRequired: "pins:read, pins:write, boards:read, user_accounts:read",
    accountRequirement: "A standard Pinterest account (business account recommended for analytics)",
    capabilities: [
      { key: "publish_text", label: "Pin titles & descriptions", supported: true },
      { key: "publish_image", label: "Create image Pins", supported: true },
      { key: "publish_video", label: "Create video Pins", supported: true, note: "Requires video upload via the media API" },
      { key: "insights", label: "Account & pin analytics", supported: true, note: "Business account required" },
      { key: "comments", label: "Comment management", supported: false, note: "Not exposed by Pinterest API v5" },
      { key: "messaging", label: "Messaging", supported: false },
    ],
  },
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  PINTEREST: "Pinterest",
};

// ---------------------------------------------------------------------------
// API contract types
// ---------------------------------------------------------------------------

export interface SessionPayload {
  user: { id: string; email: string; name: string; emailVerified: boolean };
  workspace: { id: string; name: string; slug: string; plan: PlanTier };
  role: UserRole;
  permissions: Permission[];
}

export interface AccountDTO {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: AccountStatus;
  isDemo: boolean;
  connectedAt: string;
}

export interface MediaDTO {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  aspectRatio: string | null;
  altText: string | null;
  provider: "GENERATED" | "UPLOADED";
}

export interface PostTargetDTO {
  id: string;
  accountId: string;
  platform: Platform;
  status: PostStatus;
  externalPostId: string | null;
  publishedAt: string | null;
  error: string | null;
}

export interface PostDTO {
  id: string;
  content: string;
  hashtags: string[];
  status: PostStatus;
  origin: "MANUAL" | "AI";
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  failureReason: string | null;
  media: MediaDTO[];
  targets: PostTargetDTO[];
  authorName: string;
}

export interface WorkspaceMemberDTO {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  status: "ACTIVE" | "PENDING";
  createdAt: string;
}

export interface ConversationDTO {
  id: string;
  platform: Platform;
  accountUsername: string;
  participantName: string;
  subject: string | null;
  lastMessageAt: string;
  status: "OPEN" | "RESOLVED";
  preview: string;
}

export interface MessageDTO {
  id: string;
  direction: "IN" | "OUT";
  authorName: string;
  text: string;
  aiDraft: string | null;
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export interface BillingDTO {
  plan: PlanTier;
  planLimits: PlanLimits;
  subscriptionStatus: string;
  usage: {
    aiCredits: { used: number; limit: number };
    accounts: { used: number; limit: number };
    posts30d: { used: number; limit: number };
    members: { used: number; limit: number };
    storageMb: { used: number; limit: number };
  };
  paymentNote: string;
}

export interface AnalyticsSummaryDTO {
  totals: { posts: number; published: number; scheduled: number; failed: number; drafts: number };
  aiCreditsUsed30d: number;
  byPlatform: { platform: Platform; published: number; failed: number }[];
  recent: { id: string; status: PostStatus; platform: Platform | null; publishedAt: string | null; title: string }[];
  platformInsightsAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Zod schemas — request validation on both client and server
// ---------------------------------------------------------------------------

import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const brandSchema = z.object({
  businessName: z.string().max(120).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  productsServices: z.string().max(2000).optional().nullable(),
  targetAudience: z.string().max(1000).optional().nullable(),
  brandVoice: z.string().max(300).optional().nullable(),
  writingStyle: z.string().max(300).optional().nullable(),
  brandColors: z.string().max(200).optional().nullable(),
  contentRestrictions: z.string().max(1000).optional().nullable(),
  language: z.string().max(60).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  links: z.string().max(500).optional().nullable(),
});
export type BrandInput = z.infer<typeof brandSchema>;

export const aiSettingsSchema = z.object({
  mode: z.enum(["MANUAL", "APPROVAL", "AUTO"]).optional(),
  autoReply: z.boolean().optional(),
  restrictedTopics: z.string().max(500).optional().nullable(),
});

export const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  hashtags: z.array(z.string().min(1).max(60)).max(30).default([]),
  targetAccountIds: z.array(z.string()).max(25).default([]),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED"]).default("DRAFT"),
  scheduledAt: z.string().datetime().optional().nullable(),
  mediaIds: z.array(z.string()).max(10).default([]),
  aiModel: z.string().optional().nullable(),
  aiPrompt: z.string().max(4000).optional().nullable(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  hashtags: z.array(z.string().min(1).max(60)).max(30).optional(),
  targetAccountIds: z.array(z.string()).max(25).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  mediaIds: z.array(z.string()).max(10).optional(),
});

export const schedulePostSchema = z.object({
  scheduledAt: z.string().datetime(),
});

export const captionSchema = z.object({
  topic: z.string().min(3).max(1000),
  platform: z.enum(["FACEBOOK", "INSTAGRAM", "PINTEREST"]),
  tone: z.string().max(80).default("professional"),
  goal: z.string().max(80).default("engagement"),
  language: z.string().max(40).default("English"),
  variants: z.number().int().min(1).max(3).default(2),
  includeHashtags: z.boolean().default(true),
});
export type CaptionInput = z.infer<typeof captionSchema>;

export const imageSchema = z.object({
  prompt: z.string().min(3).max(1000),
  aspectRatio: z.enum(["1:1", "4:5", "9:16", "16:9"]).default("1:1"),
});
export type ImageInput = z.infer<typeof imageSchema>;

export const assistantSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).min(1).max(20),
});
export type AssistantInput = z.infer<typeof assistantSchema>;

export const planSchema = z.object({
  focus: z.string().max(500).optional().nullable(),
  platforms: z.array(z.enum(["FACEBOOK", "INSTAGRAM", "PINTEREST"])).min(1).max(3),
  postsPerDay: z.number().int().min(1).max(3).default(1),
});
export type PlanInput = z.infer<typeof planSchema>;

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MANAGER", "EDITOR", "VIEWER"]),
});

export const planChangeSchema = z.object({
  plan: z.enum(["FREE", "STARTER", "PROFESSIONAL", "AGENCY"]),
});
