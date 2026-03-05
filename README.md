# 🏪 Retail Order & Inventory Management System

> **Stack:** Node.js · Express.js · MySQL 8.0 · REST API · JWT Auth  
> **Year:** 2026

---

## Overview

A scalable backend system for managing products, orders, inventory, and customers in a retail environment. Built with security-first design (JWT + RBAC), normalized relational schemas, and optimized SQL for fast lookups.

---

## Features

- **Role-Based Access Control** — 4 roles: `admin`, `manager`, `staff`, `viewer`
- **Product & Inventory Management** — Create products with linked inventory records, adjust stock
- **Order Lifecycle** — Place orders with atomic inventory reservation, status transitions, auto-deduct on delivery
- **Low Stock Alerts** — Computed columns + views surface reorder needs instantly
- **Audit Trail** — Every stock movement logged in `inventory_transactions`
- **Input Validation** — `express-validator` on all write endpoints
- **Rate Limiting** — 100 req/15 min per IP
- **Structured Logging** — Winston with file rotation
- **Compression** — Gzip on all responses
- **Dashboard UI** — Single-page HTML frontend served from `/`

---

## Quick Start

### 1. Install Dependencies
```bash
cd retail-ims
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 3. Initialize Database
```bash
mysql -u root -p < sql/schema.sql
```

### 4. Start Server
```bash
npm run dev      # development (nodemon)
npm start        # production
```

Open `http://localhost:3000` → Frontend Dashboard  
API base: `http://localhost:3000/api/v1`

---

## Project Structure

```
retail-ims/
├── src/
│   ├── app.js                    # Express app + server bootstrap
│   ├── config/
│   │   ├── database.js           # MySQL pool, query helper, transaction helper
│   │   └── logger.js             # Winston logger
│   ├── controllers/
│   │   ├── authController.js     # Register, login, me, change-password
│   │   ├── productController.js  # CRUD + inventory adjustment
│   │   ├── orderController.js    # Place order, status transitions, stats
│   │   ├── inventoryController.js# List, alerts, transaction history
│   │   └── customerController.js # CRUD
│   ├── middleware/
│   │   ├── auth.js               # JWT verify, authorize(), requirePermission()
│   │   └── errorHandler.js       # validate(), notFound, errorHandler, asyncHandler
│   ├── routes/
│   │   └── index.js              # All routes wired with guards
│   └── utils/
│       └── validators.js         # express-validator rule sets
├── sql/
│   └── schema.sql                # Full normalized schema, views, stored procedures
├── public/
│   └── index.html                # Dashboard SPA
├── .env.example
├── package.json
└── README.md
```

---

## Database Schema

| Table                     | Purpose                                      |
|---------------------------|----------------------------------------------|
| `roles`                   | Permissions per role (JSON)                  |
| `users`                   | Staff accounts with bcrypt passwords         |
| `categories`              | Hierarchical product categories              |
| `suppliers`               | Vendor/supplier records                      |
| `products`                | Product catalogue with pricing               |
| `inventory`               | Stock levels with computed `quantity_available` |
| `inventory_transactions`  | Full audit log of stock movements            |
| `customers`               | Customer records + tier + lifetime stats     |
| `orders`                  | Order headers with totals                    |
| `order_items`             | Line items with tax + discount               |

**Views:**
- `v_products_with_inventory` — joined product + stock view
- `v_order_summary` — order list with customer name + item count

**Stored Procedures:**
- `sp_next_order_number` — auto-increment order number by year
- `sp_place_order` — atomic stock reservation with locking

---

## API Endpoints

### Auth
| Method | Endpoint                   | Auth | Description          |
|--------|----------------------------|------|----------------------|
| POST   | `/auth/register`           | ✗    | Register user        |
| POST   | `/auth/login`              | ✗    | Login → JWT token    |
| GET    | `/auth/me`                 | ✓    | Current user profile |
| PUT    | `/auth/change-password`    | ✓    | Update password      |

### Products
| Method | Endpoint                    | Role       | Description               |
|--------|-----------------------------|------------|---------------------------|
| GET    | `/products`                 | any        | List + filter + search    |
| GET    | `/products/:id`             | any        | Single product            |
| POST   | `/products`                 | manager+   | Create product            |
| PATCH  | `/products/:id`             | manager+   | Update product            |
| DELETE | `/products/:id`             | admin      | Soft delete               |
| POST   | `/products/:id/adjust`      | manager+   | Stock adjustment          |

### Orders
| Method | Endpoint                    | Role       | Description                    |
|--------|-----------------------------|------------|--------------------------------|
| GET    | `/orders`                   | any        | List with filters              |
| GET    | `/orders/stats`             | manager+   | Revenue + inventory dashboard  |
| GET    | `/orders/:id`               | any        | Order + line items             |
| POST   | `/orders`                   | any        | Place order (locks inventory)  |
| PATCH  | `/orders/:id/status`        | any        | Advance order state            |

### Inventory
| Method | Endpoint                        | Role | Description          |
|--------|---------------------------------|------|----------------------|
| GET    | `/inventory`                    | any  | All stock levels     |
| GET    | `/inventory/alerts`             | any  | Low/out-of-stock     |
| GET    | `/inventory/transactions`       | any  | Audit trail          |

### Customers
| Method | Endpoint            | Role     | Description         |
|--------|---------------------|----------|---------------------|
| GET    | `/customers`        | any      | List customers      |
| GET    | `/customers/:id`    | any      | Profile + orders    |
| POST   | `/customers`        | any      | Create customer     |
| PATCH  | `/customers/:id`    | manager+ | Update customer     |

---

## Sample Requests (Postman / curl)

**Login:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@retailims.com","password":"Admin@1234"}'
```

**Place an Order:**
```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "<uuid>",
    "payment_method": "UPI",
    "items": [
      { "product_id": "<uuid>", "quantity": 2 }
    ]
  }'
```

**Adjust Inventory:**
```bash
curl -X POST http://localhost:3000/api/v1/products/<id>/adjust \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 50, "type": "PURCHASE", "notes": "Restock from supplier"}'
```

---

## Security

- **Passwords** hashed with bcrypt (cost factor 12)
- **JWT** tokens signed with HS256, 24h expiry
- **Helmet** sets security headers (CSP, HSTS, etc.)
- **Rate limiting** prevents brute-force
- **Role guards** on all write endpoints
- **Parameterised queries** throughout — no SQL injection surface
- **Input validation** with `express-validator` on all POST/PATCH bodies
- **Soft deletes** — no data lost on product removal

---

## Performance Optimisations

- MySQL **connection pool** (10 connections default)
- **Indexes** on `sku`, `order_number`, `status`, `customer_id`, `created_at`, `quantity_available`
- **FULLTEXT indexes** on product name/description and customer name/email for fast `MATCH...AGAINST` searches
- **Generated column** `quantity_available = quantity_on_hand - quantity_reserved` avoids runtime calculations
- **Views** (`v_products_with_inventory`, `v_order_summary`) pre-join frequently queried combinations
- `SELECT FOR UPDATE` on inventory during order placement prevents overselling under concurrent load
- **Gzip compression** on all API responses
- **Structured routing** with `asyncHandler` avoids unhandled rejections

---

## License

MIT — © 2026
