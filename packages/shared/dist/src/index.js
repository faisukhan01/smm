/**
 * SMM Shared — single source of truth for domain types, plan limits,
 * platform capabilities and API contracts. Used by the web app, the
 * NestJS API and the publishing worker.
 */ // ---------------------------------------------------------------------------
// Enums (mirror prisma/schema.prisma)
// ---------------------------------------------------------------------------
export var USER_ROLES = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "EDITOR",
    "VIEWER"
];
export var PLATFORMS = [
    "FACEBOOK",
    "INSTAGRAM",
    "PINTEREST"
];
export var ACCOUNT_STATUSES = [
    "CONNECTED",
    "EXPIRED",
    "REVOKED",
    "ERROR"
];
export var POST_STATUSES = [
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SCHEDULED",
    "PUBLISHING",
    "PUBLISHED",
    "FAILED",
    "CANCELLED"
];
export var AI_KINDS = [
    "CAPTION",
    "HASHTAGS",
    "IMAGE",
    "ASSISTANT",
    "PLAN",
    "REPLY_DRAFT"
];
export var AI_MODES = [
    "MANUAL",
    "APPROVAL",
    "AUTO"
];
export var PLAN_TIERS = [
    "FREE",
    "STARTER",
    "PROFESSIONAL",
    "AGENCY"
];
export var ROLE_PERMISSIONS = {
    OWNER: [
        "workspace:read",
        "workspace:update",
        "brand:read",
        "brand:write",
        "post:read",
        "post:draft",
        "post:edit",
        "post:approve",
        "post:schedule",
        "post:delete",
        "account:read",
        "account:connect",
        "account:disconnect",
        "inbox:read",
        "inbox:reply",
        "ai:use",
        "analytics:read",
        "billing:manage",
        "team:manage",
        "audit:read"
    ],
    ADMIN: [
        "workspace:read",
        "workspace:update",
        "brand:read",
        "brand:write",
        "post:read",
        "post:draft",
        "post:edit",
        "post:approve",
        "post:schedule",
        "post:delete",
        "account:read",
        "account:connect",
        "account:disconnect",
        "inbox:read",
        "inbox:reply",
        "ai:use",
        "analytics:read",
        "team:manage",
        "audit:read"
    ],
    MANAGER: [
        "workspace:read",
        "brand:read",
        "brand:write",
        "post:read",
        "post:draft",
        "post:edit",
        "post:approve",
        "post:schedule",
        "account:read",
        "account:connect",
        "inbox:read",
        "inbox:reply",
        "ai:use",
        "analytics:read"
    ],
    EDITOR: [
        "workspace:read",
        "brand:read",
        "post:read",
        "post:draft",
        "post:edit",
        "account:read",
        "inbox:read",
        "ai:use",
        "analytics:read"
    ],
    VIEWER: [
        "workspace:read",
        "brand:read",
        "post:read",
        "account:read",
        "inbox:read",
        "analytics:read"
    ]
};
export function roleHas(role, permission) {
    var _ref;
    var _ROLE_PERMISSIONS_role;
    return (_ref = (_ROLE_PERMISSIONS_role = ROLE_PERMISSIONS[role]) === null || _ROLE_PERMISSIONS_role === void 0 ? void 0 : _ROLE_PERMISSIONS_role.includes(permission)) !== null && _ref !== void 0 ? _ref : false;
}
export var PLANS = {
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
        features: [
            "2 social accounts",
            "30 AI credits / month",
            "20 posts / month",
            "7-day analytics history"
        ]
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
        features: [
            "5 social accounts",
            "200 AI credits / month",
            "150 posts / month",
            "30-day analytics history",
            "Content calendar"
        ]
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
        features: [
            "10 social accounts",
            "600 AI credits / month",
            "600 posts / month",
            "90-day analytics history",
            "Approval workflows",
            "Team roles"
        ]
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
        features: [
            "25 social accounts",
            "2,000 AI credits / month",
            "2,500 posts / month",
            "Full analytics history",
            "Up to 15 team members",
            "Priority support"
        ]
    }
};
export var PLATFORM_META = {
    FACEBOOK: {
        platform: "FACEBOOK",
        name: "Facebook Pages",
        docsUrl: "https://developers.facebook.com/docs/pages-api",
        reviewRequired: "pages_show_list, pages_manage_posts, pages_read_engagement, pages_manage_engagement",
        accountRequirement: "A Facebook Page (personal profiles are not supported by the Pages API)",
        capabilities: [
            {
                key: "publish_text",
                label: "Publish text posts",
                supported: true
            },
            {
                key: "publish_image",
                label: "Publish image posts",
                supported: true
            },
            {
                key: "publish_video",
                label: "Publish video posts",
                supported: true
            },
            {
                key: "insights",
                label: "Post & page insights",
                supported: true
            },
            {
                key: "comments",
                label: "Read & reply to comments",
                supported: true
            },
            {
                key: "messaging",
                label: "Page messaging",
                supported: true,
                note: "Requires Messenger Platform permissions"
            }
        ]
    },
    INSTAGRAM: {
        platform: "INSTAGRAM",
        name: "Instagram Professional",
        docsUrl: "https://developers.facebook.com/docs/instagram-platform",
        reviewRequired: "instagram_basic, instagram_content_publish, instagram_manage_comments, business_management",
        accountRequirement: "Instagram Professional (Business or Creator) account linked to a Facebook Page",
        capabilities: [
            {
                key: "publish_text",
                label: "Publish captions",
                supported: true
            },
            {
                key: "publish_image",
                label: "Publish images & carousels",
                supported: true,
                note: "Media must be hosted at a public URL (S3 storage)"
            },
            {
                key: "publish_video",
                label: "Publish Reels & video",
                supported: true,
                note: "Via the container publish flow"
            },
            {
                key: "insights",
                label: "Account & media insights",
                supported: true
            },
            {
                key: "comments",
                label: "Read & reply to comments",
                supported: true
            },
            {
                key: "messaging",
                label: "Direct messages",
                supported: false,
                note: "Not available through the Instagram Platform API"
            }
        ]
    },
    PINTEREST: {
        platform: "PINTEREST",
        name: "Pinterest",
        docsUrl: "https://developers.pinterest.com/docs/api/v5/",
        reviewRequired: "pins:read, pins:write, boards:read, user_accounts:read",
        accountRequirement: "A standard Pinterest account (business account recommended for analytics)",
        capabilities: [
            {
                key: "publish_text",
                label: "Pin titles & descriptions",
                supported: true
            },
            {
                key: "publish_image",
                label: "Create image Pins",
                supported: true
            },
            {
                key: "publish_video",
                label: "Create video Pins",
                supported: true,
                note: "Requires video upload via the media API"
            },
            {
                key: "insights",
                label: "Account & pin analytics",
                supported: true,
                note: "Business account required"
            },
            {
                key: "comments",
                label: "Comment management",
                supported: false,
                note: "Not exposed by Pinterest API v5"
            },
            {
                key: "messaging",
                label: "Messaging",
                supported: false
            }
        ]
    }
};
export var PLATFORM_LABEL = {
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    PINTEREST: "Pinterest"
};
// ---------------------------------------------------------------------------
// Zod schemas — request validation on both client and server
// ---------------------------------------------------------------------------
import { z } from "zod";
export var registerSchema = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email().max(200),
    password: z.string().min(8).max(100)
});
export var loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});
export var brandSchema = z.object({
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
    links: z.string().max(500).optional().nullable()
});
export var aiSettingsSchema = z.object({
    mode: z.enum([
        "MANUAL",
        "APPROVAL",
        "AUTO"
    ]).optional(),
    autoReply: z.boolean().optional(),
    restrictedTopics: z.string().max(500).optional().nullable()
});
export var createPostSchema = z.object({
    content: z.string().min(1).max(5000),
    hashtags: z.array(z.string().min(1).max(60)).max(30).default([]),
    targetAccountIds: z.array(z.string()).max(25).default([]),
    status: z.enum([
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED"
    ]).default("DRAFT"),
    scheduledAt: z.string().datetime().optional().nullable(),
    mediaIds: z.array(z.string()).max(10).default([]),
    aiModel: z.string().optional().nullable(),
    aiPrompt: z.string().max(4000).optional().nullable()
});
export var updatePostSchema = z.object({
    content: z.string().min(1).max(5000).optional(),
    hashtags: z.array(z.string().min(1).max(60)).max(30).optional(),
    targetAccountIds: z.array(z.string()).max(25).optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
    mediaIds: z.array(z.string()).max(10).optional()
});
export var schedulePostSchema = z.object({
    scheduledAt: z.string().datetime()
});
export var captionSchema = z.object({
    topic: z.string().min(3).max(1000),
    platform: z.enum([
        "FACEBOOK",
        "INSTAGRAM",
        "PINTEREST"
    ]),
    tone: z.string().max(80).default("professional"),
    goal: z.string().max(80).default("engagement"),
    language: z.string().max(40).default("English"),
    variants: z.number().int().min(1).max(3).default(2),
    includeHashtags: z.boolean().default(true)
});
export var imageSchema = z.object({
    prompt: z.string().min(3).max(1000),
    aspectRatio: z.enum([
        "1:1",
        "4:5",
        "9:16",
        "16:9"
    ]).default("1:1")
});
export var assistantSchema = z.object({
    messages: z.array(z.object({
        role: z.enum([
            "user",
            "assistant"
        ]),
        content: z.string().min(1).max(4000)
    })).min(1).max(20)
});
export var planSchema = z.object({
    focus: z.string().max(500).optional().nullable(),
    platforms: z.array(z.enum([
        "FACEBOOK",
        "INSTAGRAM",
        "PINTEREST"
    ])).min(1).max(3),
    postsPerDay: z.number().int().min(1).max(3).default(1)
});
export var inviteSchema = z.object({
    email: z.string().email(),
    role: z.enum([
        "ADMIN",
        "MANAGER",
        "EDITOR",
        "VIEWER"
    ])
});
export var planChangeSchema = z.object({
    plan: z.enum([
        "FREE",
        "STARTER",
        "PROFESSIONAL",
        "AGENCY"
    ])
});
