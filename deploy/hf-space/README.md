---
title: SMM API
emoji: "\u2605"
colorFrom: teal
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# SMM — API + publishing worker (all-in-one)

NestJS REST API + publishing engine for the SMM social media manager.

- Health: `/api/v1/health`
- Swagger: `/api/v1/docs`
- All data routes require a session (register via the SMM web app on Vercel)

Secrets are configured as Space **variables and secrets** (Settings tab) —
see `deploy/.env.oracle.example` in the source repo for the full list.
