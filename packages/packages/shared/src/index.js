/**
 * SMM Shared — single source of truth for domain types, plan limits,
 * platform capabilities and API contracts. Used by the web app, the
 * NestJS API and the publishing worker.
 */ // ---------------------------------------------------------------------------
// Enums (mirror prisma/schema.prisma)
// ---------------------------------------------------------------------------
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get ACCOUNT_STATUSES () {
        return ACCOUNT_STATUSES;
    },
    get AI_KINDS () {
        return AI_KINDS;
    },
    get AI_MODES () {
        return AI_MODES;
    },
    get PLANS () {
        return PLANS;
    },
    get PLAN_TIERS () {
        return PLAN_TIERS;
    },
    get PLATFORMS () {
        return PLATFORMS;
    },
    get PLATFORM_LABEL () {
        return PLATFORM_LABEL;
    },
    get PLATFORM_META () {
        return PLATFORM_META;
    },
    get POST_STATUSES () {
        return POST_STATUSES;
    },
    get ROLE_PERMISSIONS () {
        return ROLE_PERMISSIONS;
    },
    get USER_ROLES () {
        return USER_ROLES;
    },
    get aiSettingsSchema () {
        return aiSettingsSchema;
    },
    get assistantSchema () {
        return assistantSchema;
    },
    get brandSchema () {
        return brandSchema;
    },
    get captionSchema () {
        return captionSchema;
    },
    get createPostSchema () {
        return createPostSchema;
    },
    get imageSchema () {
        return imageSchema;
    },
    get inviteSchema () {
        return inviteSchema;
    },
    get loginSchema () {
        return loginSchema;
    },
    get planChangeSchema () {
        return planChangeSchema;
    },
    get planSchema () {
        return planSchema;
    },
    get registerSchema () {
        return registerSchema;
    },
    get roleHas () {
        return roleHas;
    },
    get schedulePostSchema () {
        return schedulePostSchema;
    },
    get updatePostSchema () {
        return updatePostSchema;
    }
});
const _zod = require("zod");
const USER_ROLES = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "EDITOR",
    "VIEWER"
];
const PLATFORMS = [
    "FACEBOOK",
    "INSTAGRAM",
    "PINTEREST"
];
const ACCOUNT_STATUSES = [
    "CONNECTED",
    "EXPIRED",
    "REVOKED",
    "ERROR"
];
const POST_STATUSES = [
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SCHEDULED",
    "PUBLISHING",
    "PUBLISHED",
    "FAILED",
    "CANCELLED"
];
const AI_KINDS = [
    "CAPTION",
    "HASHTAGS",
    "IMAGE",
    "ASSISTANT",
    "PLAN",
    "REPLY_DRAFT"
];
const AI_MODES = [
    "MANUAL",
    "APPROVAL",
    "AUTO"
];
const PLAN_TIERS = [
    "FREE",
    "STARTER",
    "PROFESSIONAL",
    "AGENCY"
];
const ROLE_PERMISSIONS = {
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
function roleHas(role, permission) {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
const PLANS = {
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
const PLATFORM_META = {
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
const PLATFORM_LABEL = {
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    PINTEREST: "Pinterest"
};
const registerSchema = _zod.z.object({
    name: _zod.z.string().min(2).max(80),
    email: _zod.z.string().email().max(200),
    password: _zod.z.string().min(8).max(100)
});
const loginSchema = _zod.z.object({
    email: _zod.z.string().email(),
    password: _zod.z.string().min(1)
});
const brandSchema = _zod.z.object({
    businessName: _zod.z.string().max(120).optional().nullable(),
    description: _zod.z.string().max(2000).optional().nullable(),
    industry: _zod.z.string().max(120).optional().nullable(),
    productsServices: _zod.z.string().max(2000).optional().nullable(),
    targetAudience: _zod.z.string().max(1000).optional().nullable(),
    brandVoice: _zod.z.string().max(300).optional().nullable(),
    writingStyle: _zod.z.string().max(300).optional().nullable(),
    brandColors: _zod.z.string().max(200).optional().nullable(),
    contentRestrictions: _zod.z.string().max(1000).optional().nullable(),
    language: _zod.z.string().max(60).optional().nullable(),
    website: _zod.z.string().max(300).optional().nullable(),
    links: _zod.z.string().max(500).optional().nullable()
});
const aiSettingsSchema = _zod.z.object({
    mode: _zod.z.enum([
        "MANUAL",
        "APPROVAL",
        "AUTO"
    ]).optional(),
    autoReply: _zod.z.boolean().optional(),
    restrictedTopics: _zod.z.string().max(500).optional().nullable()
});
const createPostSchema = _zod.z.object({
    content: _zod.z.string().min(1).max(5000),
    hashtags: _zod.z.array(_zod.z.string().min(1).max(60)).max(30).default([]),
    targetAccountIds: _zod.z.array(_zod.z.string()).max(25).default([]),
    status: _zod.z.enum([
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED"
    ]).default("DRAFT"),
    scheduledAt: _zod.z.string().datetime().optional().nullable(),
    mediaIds: _zod.z.array(_zod.z.string()).max(10).default([]),
    aiModel: _zod.z.string().optional().nullable(),
    aiPrompt: _zod.z.string().max(4000).optional().nullable()
});
const updatePostSchema = _zod.z.object({
    content: _zod.z.string().min(1).max(5000).optional(),
    hashtags: _zod.z.array(_zod.z.string().min(1).max(60)).max(30).optional(),
    targetAccountIds: _zod.z.array(_zod.z.string()).max(25).optional(),
    scheduledAt: _zod.z.string().datetime().optional().nullable(),
    mediaIds: _zod.z.array(_zod.z.string()).max(10).optional()
});
const schedulePostSchema = _zod.z.object({
    scheduledAt: _zod.z.string().datetime()
});
const captionSchema = _zod.z.object({
    topic: _zod.z.string().min(3).max(1000),
    platform: _zod.z.enum([
        "FACEBOOK",
        "INSTAGRAM",
        "PINTEREST"
    ]),
    tone: _zod.z.string().max(80).default("professional"),
    goal: _zod.z.string().max(80).default("engagement"),
    language: _zod.z.string().max(40).default("English"),
    variants: _zod.z.number().int().min(1).max(3).default(2),
    includeHashtags: _zod.z.boolean().default(true)
});
const imageSchema = _zod.z.object({
    prompt: _zod.z.string().min(3).max(1000),
    aspectRatio: _zod.z.enum([
        "1:1",
        "4:5",
        "9:16",
        "16:9"
    ]).default("1:1")
});
const assistantSchema = _zod.z.object({
    messages: _zod.z.array(_zod.z.object({
        role: _zod.z.enum([
            "user",
            "assistant"
        ]),
        content: _zod.z.string().min(1).max(4000)
    })).min(1).max(20)
});
const planSchema = _zod.z.object({
    focus: _zod.z.string().max(500).optional().nullable(),
    platforms: _zod.z.array(_zod.z.enum([
        "FACEBOOK",
        "INSTAGRAM",
        "PINTEREST"
    ])).min(1).max(3),
    postsPerDay: _zod.z.number().int().min(1).max(3).default(1)
});
const inviteSchema = _zod.z.object({
    email: _zod.z.string().email(),
    role: _zod.z.enum([
        "ADMIN",
        "MANAGER",
        "EDITOR",
        "VIEWER"
    ])
});
const planChangeSchema = _zod.z.object({
    plan: _zod.z.enum([
        "FREE",
        "STARTER",
        "PROFESSIONAL",
        "AGENCY"
    ])
});
