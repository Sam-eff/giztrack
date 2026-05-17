---
title: Giztrack Backend
emoji: 🛠️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# 🛠️ Giztrack

> A full-stack SaaS point-of-sale and workshop management platform built for tech repair shops in Nigeria.

---

## 📋 Table of Contents

1. [What is Giztrack?](#what-is--manager)
2. [Key Features](#key-features)
3. [Tech Stack](#tech-stack)

---

## What is Giztrack?

**Giztrack** (codenamed `Giztrack Inventory Management`) is a multi-tenant SaaS platform designed specifically for **tech gadget repair shops** in Nigeria. It provides everything a shop owner needs to run their business digitally:

- 📦 **Inventory** — track stock, set low-stock alerts, manage categories
- 🛒 **Point of Sale** — process transactions, auto-deduct stock, record profit
- 🔧 **Repair Tickets** — log device repairs with a full lifecycle workflow from receipt to collection
- 👥 **Customer Directory** — maintain a database of customers linked to purchases and repairs
- 📊 **Analytics Hub** — real-time revenue, profit, and performance charts
- 💳 **Billing** — subscription plans powered by Paystack (Nigerian payment gateway)
- 👨‍💼 **Multi-User** — admin, staff, and technician roles with scoped access
- 📱 **SMS Notifications** — automated customer alerts via Africa's Talking

---

## Key Features

| Feature | Description |
|---|---|
| **Multi-tenant** | Each registered shop is fully isolated — all data is scoped by `shop` FK |
| **14-Day Free Trial** | Full access for 14 days from registration; hard paywall after expiry |
| **Role-Based Access** | `admin`, `staff`, and `technician` roles with fine-grained permissions |
| **Repair State Machine** | Enforced transitions: `Received → Diagnosing → Waiting Parts → Fixed → Collected` |
| **Price Snapshotting** | Sale items and repair parts snapshot prices at time of transaction |
| **Stock Audit Trail** | `StockLog` records every inventory movement with reason and timestamp |
| **Async Tasks** | Django Q2 handles low-stock alerts, subscription reminders, and daily summaries |
| **Dark Mode** | Full dark/light theme toggle stored locally |
| **Responsive UI** | Mobile-first design; tabs, overlays, and navigation all mobile-optimized |

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.13 | Runtime |
| **Django** | 6.0.3 | Web framework |
| **Django REST Framework** | Latest | REST API layer |
| **djangorestframework-simplejwt** | Latest | JWT authentication |
| **django-cors-headers** | Latest | CORS support for SPA |
| **django-environ** | Latest | `.env` file management |
| **django-jazzmin** | Latest | Custom Django admin UI |
| **Django Q2** | Latest | Async task queue |
| **PostgreSQL** | 16 | Production database |
| **SQLite** | — | Development database |
| **Gunicorn** | Latest | WSGI server for production |
| **Africa's Talking** | Latest | SMS notifications |
| **Pillow** | Latest | Image processing (logos) |
| **psycopg2** | Latest | PostgreSQL adapter |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.2 | UI framework |
| **TypeScript** | 5.9 | Type safety |
| **Vite** | 7 | Build tool & dev server |
| **Tailwind CSS** | 4 | Utility-first styling |
| **React Router DOM** | 7 | Client-side routing |
| **Axios** | 1.13 | HTTP client |
| **Recharts** | 3.8 | Analytics charts |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Docker** | Containerisation |
| **Docker Compose** | Multi-service orchestration |
| **Paystack** | Payment gateway (NGN subscriptions) |

