<div align="center">
  <h1>🛠️ Giztrack</h1>
  <p><strong>A full-stack SaaS point-of-sale, inventory, and workshop management platform built for tech repair shops.</strong></p>
</div>

---

**Giztrack** is a multi-tenant SaaS platform designed specifically for tech gadget repair shops. It provides everything a shop owner needs to run their business digitally—from tracking stock to printing receipts and sending SMS notifications to customers. 

## 🌟 Key Features

*   🏢 **Multi-Tenant Architecture**: Each registered shop is fully isolated with its own scoped data and dashboard.
*   📦 **Inventory Management**: Track stock levels in real-time, set low-stock thresholds, and manage product categories.
*   🛒 **Point of Sale (POS)**: Process transactions, automatically deduct stock, record profit margins, and lock in price snapshots.
*   🔧 **Repair Ticket System**: Track device repairs through an enforced lifecycle workflow: `Received → Diagnosing → Waiting Parts → Fixed → Collected`.
*   👥 **Customer Directory**: Maintain a database of customers linked to their purchases, repairs, and contact details.
*   📊 **Analytics Hub**: Visualize real-time revenue, profit, and performance metrics.
*   💳 **Subscription Billing**: Automated SaaS subscription plans powered by Paystack.
*   👨‍💼 **Role-Based Access Control**: Granular permissions for `admin`, `staff`, and `technician` roles.
*   📱 **Progressive Web App (PWA)**: Installable on mobile and desktop with offline-capable interfaces.
*   💬 **Automated SMS Notifications**: Keep customers in the loop with automated alerts via Africa's Talking.
*   ⚙️ **Background Tasks**: Django Q2 handles async tasks like low-stock alerts, subscription reminders, and daily summaries.
*   🌙 **Modern UI/UX**: Fully responsive, mobile-first design with a dark/light theme toggle.

## 🛠️ Tech Stack

### Frontend
*   **Framework**: React 19.2, TypeScript 5.9
*   **Build Tool**: Vite 7
*   **Styling**: Tailwind CSS 4
*   **Routing & HTTP**: React Router DOM 7, Axios
*   **Data Visualization**: Recharts
*   **Monitoring**: Sentry (Browser React)

### Backend
*   **Framework**: Python 3.13, Django 6.0
*   **API**: Django REST Framework (DRF)
*   **Authentication**: djangorestframework-simplejwt
*   **Database**: PostgreSQL 16 (Production) / SQLite (Development)
*   **Async Task Queue**: Django Q2
*   **Static/Media**: Whitenoise, Cloudinary, Pillow
*   **Integrations**: Africa's Talking (SMS), Paystack (Payments)
*   **Server**: Gunicorn

### Infrastructure
*   **Containerization**: Docker, Docker Compose

---

## 🚀 Getting Started

This repository is optimized for local Docker development with two distinct workflows.

### Prerequisites
*   [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed on your machine.
*   Node.js (for local frontend development without Docker, if preferred).

### 1. Live-Reload Development Stack (Recommended for Dev)
Use this mode when actively developing. It provides hot-reloading for the React frontend via Vite (`localhost:5173`) and auto-reloading for the Django backend (`localhost:8000`).

```bash
# Start the development containers
docker compose -f docker-compose.dev.yml up --build
```
*   **Frontend**: [http://localhost:5173/](http://localhost:5173/)
*   **Backend API**: [http://localhost:8000/](http://localhost:8000/)

### 2. Production-like Docker Stack
Use this mode to test the built application exactly as it will be served by Nginx in production.

```bash
# Start the production-like containers
docker compose up --build
```
*   **Application URL**: [http://localhost/](http://localhost/)

## 🔧 Environment Variables

To run the application, you need to configure your environment variables. 
Copy the example files and update them with your credentials:

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Ensure you configure necessary API keys (Paystack, Africa's Talking, Cloudinary, Sentry) for full functionality.

## 📄 Documentation

*   [Production Deployment Guide](./PRODUCTION.md)
*   [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md)
*   [VPS Deployment Guide](./VPS_DEPLOYMENT.md)

---
<div align="center">
  <p>Built with ❤️ for tech business shops.</p>
</div>
