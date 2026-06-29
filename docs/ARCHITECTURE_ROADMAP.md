# Giztrack Architecture Roadmap

This guide explains the architectural core of Giztrack in a visual, interview-friendly way.
Use it to understand how the app is structured, how requests move through the system,
where the important business rules live, and how to talk about the design tradeoffs.

## 1. One-Sentence System Definition

Giztrack is a multi-tenant SaaS application for electronics repair shops, combining POS,
inventory, repairs, procurement, expenses, reports, staff permissions, and Paystack
subscription billing in one dashboard.

## 2. Big Picture

```mermaid
flowchart LR
    User[Shop owner / staff / technician]
    Browser[Browser or installed PWA]
    Frontend[React + TypeScript SPA]
    API[Django REST API]
    DB[(PostgreSQL)]
    Worker[Django Q2 worker]
    Paystack[Paystack]
    Email[Email provider]
    SMS[SMS provider]
    Cloudinary[Cloudinary media storage]
    Sentry[Sentry monitoring]

    User --> Browser
    Browser --> Frontend
    Frontend -->|HTTPS + cookies + CSRF| API
    API --> DB
    API -->|enqueue jobs| Worker
    Worker --> DB
    API --> Paystack
    Paystack -->|signed webhooks| API
    Worker --> Email
    Worker --> SMS
    API --> Cloudinary
    Frontend --> Sentry
    API --> Sentry
```

Interview explanation:

> The app has a React frontend and a Django REST backend. The backend is a modular
> monolith: one deployable Django service, but separated internally into domain apps
> like sales, inventory, repairs, subscriptions, and reports. PostgreSQL is the system
> of record. Background tasks run through Django Q2. External integrations include
> Paystack for billing, email/SMS for notifications, Cloudinary for media, and Sentry
> for monitoring.

## 3. Why This Is A Modular Monolith

```mermaid
flowchart TB
    Monolith[One Django backend deployable]

    Monolith --> Accounts[accounts]
    Monolith --> Shops[shops]
    Monolith --> Inventory[inventory]
    Monolith --> Sales[sales]
    Monolith --> Repairs[repairs]
    Monolith --> Suppliers[suppliers]
    Monolith --> Customers[customers]
    Monolith --> Finance[finance]
    Monolith --> Reports[reports]
    Monolith --> Subscriptions[subscriptions]
    Monolith --> Notifications[notifications]

    Accounts --> DB[(Shared PostgreSQL database)]
    Shops --> DB
    Inventory --> DB
    Sales --> DB
    Repairs --> DB
    Suppliers --> DB
    Customers --> DB
    Finance --> DB
    Reports --> DB
    Subscriptions --> DB
    Notifications --> DB
```

How to explain it:

> It is not microservices. It is a modular monolith. Each business domain has its own
> Django app, models, serializers, views, tests, and URLs, but everything runs inside
> one backend process and one database. That keeps deployment simple and makes
> cross-domain database transactions easier.

Tradeoff:

- Good: easier deployment, simpler debugging, strong database transactions, lower cost.
- Bad: one backend release affects the whole API, and scaling is less granular than microservices.
- Future path: split only after a domain has independent traffic, team ownership, or scaling needs.

## 4. Runtime Architecture

```mermaid
flowchart LR
    subgraph Client
        React[React SPA]
        PWA[PWA cache / install support]
    end

    subgraph WebRuntime[Web runtime]
        Nginx[Nginx]
        Gunicorn[Gunicorn]
        Django[Django API]
    end

    subgraph DataRuntime[Data and jobs]
        Postgres[(PostgreSQL)]
        Q[Django Q2]
    end

    React --> Nginx
    PWA --> React
    Nginx -->|/api/v1/*| Gunicorn
    Gunicorn --> Django
    Django --> Postgres
    Django --> Q
    Q --> Postgres
```

Production-like explanation:

> The built React app is served by Nginx. API requests are proxied to Gunicorn,
> which runs Django. Django reads and writes PostgreSQL. Long-running or scheduled
> tasks are handled by a separate Django Q2 worker process.

## 5. Request Lifecycle

```mermaid
sequenceDiagram
    participant UI as React UI
    participant Axios as Axios client
    participant Django as Django middleware
    participant Auth as Cookie JWT auth
    participant View as DRF view
    participant DB as PostgreSQL

    UI->>Axios: User submits form
    Axios->>Django: Request with HttpOnly cookies
    Axios->>Django: X-CSRFToken for unsafe methods
    Django->>Django: CORS, security, CSRF, session, auth middleware
    Django->>Auth: Validate JWT from cookie
    Auth->>Auth: Enforce CSRF
    Django->>Django: Subscription middleware checks write access
    Django->>View: Route to DRF endpoint
    View->>View: Permission checks
    View->>DB: Shop-scoped query or transaction
    DB-->>View: Data
    View-->>UI: JSON response
```

Key interview points:

- Tokens are stored in HttpOnly cookies, not localStorage.
- CSRF is required because cookies are sent automatically by browsers.
- Most API views require authentication by default.
- Write requests can be blocked if trial and subscription access are expired.
- Business data is scoped by `request.user.shop`.

Relevant code:

- `backend/utils/authentication.py`
- `backend/utils/middleware.py`
- `backend/utils/mixins.py`
- `frontend/src/api/axios.ts`

## 6. Tenant Isolation

```mermaid
flowchart TB
    User[Authenticated user]
    Shop[Shop tenant]

    User -->|belongs to| Shop
    Shop --> Products[Products]
    Shop --> Customers[Customers]
    Shop --> Sales[Sales]
    Shop --> Repairs[Repairs]
    Shop --> Suppliers[Suppliers]
    Shop --> Expenses[Expenses]
    Shop --> Subscription[Subscription]
    Shop --> Staff[Users]
```

How it works:

> The shop is the tenant boundary. Each user belongs to one shop. Most business
> records have a `shop` foreign key. Shared helpers filter querysets by the current
> user's shop and inject that shop during creation.

Main risk to watch:

> Any new endpoint that forgets shop scoping can become a data leak. In interviews,
> mention that tenant scoping should be covered by tests for every new resource.

## 7. Domain Model Map

```mermaid
erDiagram
    Shop ||--o{ CustomUser : has
    Shop ||--o{ Product : owns
    Shop ||--o{ Customer : owns
    Shop ||--o{ Supplier : owns
    Shop ||--o{ Sale : records
    Shop ||--o{ RepairTicket : manages
    Shop ||--o{ Expense : logs
    Shop ||--|| Subscription : has

    Product ||--o{ ProductUnit : tracks
    Product ||--o{ StockLog : changes
    Product ||--o{ SaleItem : sold_as
    Product ||--o{ RepairPart : used_as

    Sale ||--o{ SaleItem : contains
    Sale ||--o{ SalePayment : paid_by
    Sale }o--|| Customer : buyer

    RepairTicket }o--|| Customer : owner
    RepairTicket ||--o{ RepairPart : uses

    Supplier ||--o{ PurchaseOrder : receives
    PurchaseOrder ||--o{ PurchaseOrderItem : contains

    Plan ||--o{ Subscription : selected_by
    Plan ||--o{ PaymentHistory : billed_as
```

Data design principle:

> Operational entities point to the shop. Historical records snapshot important
> values such as product name, cost price, and sale price so old reports stay correct
> even after products are edited.

## 8. Sales Workflow

```mermaid
sequenceDiagram
    participant Staff as Staff/Admin
    participant API as SaleViewSet
    participant DB as PostgreSQL

    Staff->>API: Create sale
    API->>API: Validate serializer
    API->>DB: Begin transaction
    API->>DB: Get or create customer
    API->>DB: Lock product rows with select_for_update
    API->>API: Validate stock, discount, credit rules
    API->>DB: Create Sale
    API->>DB: Create SalePayment
    API->>DB: Create SaleItems with price snapshots
    API->>DB: Deduct product quantity
    API->>DB: Create StockLog
    API->>DB: Mark IMEI units as sold
    DB-->>API: Commit transaction
    API-->>Staff: Sale recorded
```

Why this matters:

> The sale workflow protects inventory consistency. It uses a database transaction
> so partial sales cannot be saved, and row locks prevent concurrent overselling.

Interview terms to use:

- ACID transaction
- row-level locking
- race condition
- atomic rollback
- immutable sales history
- stock ledger

## 9. Repair Workflow

```mermaid
flowchart LR
    Intake[Create repair ticket]
    Assign[Assign technician]
    Diagnose[Update status]
    Parts[Use inventory parts]
    Payment[Record payment]
    Fixed[Mark fixed]
    Notify[Notify customer]
    Collected[Customer collects device]

    Intake --> Assign
    Assign --> Diagnose
    Diagnose --> Parts
    Parts --> Payment
    Payment --> Fixed
    Fixed --> Notify
    Notify --> Collected
```

Important engineering idea:

> Repairs connect customer service with inventory. When parts are used, stock is
> deducted and a stock log is created. When a repair is marked fixed, notification
> work is pushed to Django Q2 instead of blocking the request.

## 10. Purchase Order And Inventory Flow

```mermaid
flowchart TB
    Supplier[Supplier]
    PO[Purchase order]
    Items[Purchase order items]
    Receive[Receive items]
    Product[Product quantity increases]
    Units[ProductUnit IMEI/serial records]
    StockLog[StockLog purchase entry]

    Supplier --> PO
    PO --> Items
    Items --> Receive
    Receive --> Product
    Receive --> Units
    Receive --> StockLog
```

How to explain it:

> Inventory can increase through purchase-order receiving. The system updates the
> aggregate product quantity, optionally creates serialized unit records, and logs
> the stock movement for auditability.

## 11. Subscription And Billing Flow

```mermaid
sequenceDiagram
    participant Admin as Shop admin
    participant API as Django subscriptions API
    participant Paystack as Paystack
    participant DB as PostgreSQL

    Admin->>API: Choose plan
    API->>DB: Create pending checkout
    API->>Paystack: Initialize transaction
    Paystack-->>Admin: Checkout page
    Paystack->>API: Signed webhook
    API->>API: Verify HMAC signature
    API->>DB: Activate subscription
    API->>DB: Set period end
    API->>DB: Record payment history
    API-->>Admin: App access restored
```

Auto-renewal recovery:

```mermaid
flowchart LR
    Renewal[Paystack renewal happens]
    Webhook[Webhook may arrive or fail]
    LocalState[Local DB may remain expired]
    Reconcile[reconcile_paystack_subscriptions command]
    Remote[Paystack active subscription]
    Unlock[Update local period end and unlock shop]

    Renewal --> Webhook
    Webhook --> LocalState
    LocalState --> Reconcile
    Reconcile --> Remote
    Remote --> Unlock
```

Interview explanation:

> Webhooks are the normal source of truth for payment events, but webhooks can be
> delayed, fail, or have payload differences between initial charge and renewal.
> The reconciliation command is an operational safety net. It compares local
> subscription records with Paystack and updates local access when the remote
> subscription is active.

## 12. Access Control Layers

```mermaid
flowchart TB
    Request[Incoming request]
    Auth[Authenticated user?]
    Role[Role allowed?]
    Tenant[Object belongs to user's shop?]
    Plan[Plan permits feature?]
    Subscription[Trial/subscription permits writes?]
    Action[Perform business action]

    Request --> Auth
    Auth --> Role
    Role --> Tenant
    Tenant --> Plan
    Plan --> Subscription
    Subscription --> Action
```

The layers are:

- Authentication: who are you?
- Role authorization: admin, staff, or technician?
- Tenant authorization: does this record belong to your shop?
- Plan authorization: Basic, Pro, or trial feature?
- Subscription access: can this shop still write data?

## 13. Reporting Architecture

```mermaid
flowchart LR
    Sales[Sales]
    Repairs[Repairs]
    Expenses[Expenses]
    Inventory[Inventory]
    Customers[Customers]
    Reports[Reports API]
    CSV[CSV export]
    PDF[PDF export]
    Backup[Shop backup/export]

    Sales --> Reports
    Repairs --> Reports
    Expenses --> Reports
    Inventory --> Reports
    Customers --> Reports
    Reports --> CSV
    Reports --> PDF
    Reports --> Backup
```

How to explain it:

> Reports are read models built from operational tables. The reports app does not
> own much data itself; it aggregates sales, repairs, expenses, inventory, and
> customers into summaries, charts, exports, and backups.

Scaling discussion:

- Current approach is fine for moderate data sizes.
- For larger shops, add indexes, query profiling, cached summaries, or reporting tables.
- At higher scale, move analytics into a data warehouse or asynchronous materialized reports.

## 14. Frontend Architecture

```mermaid
flowchart TB
    App[App.tsx routes]
    Layout[Layout and navigation]
    Pages[Lazy-loaded pages]
    Contexts[Auth, Theme, Toast contexts]
    API[Axios API client]
    Components[Reusable components]

    App --> Layout
    App --> Pages
    Layout --> Contexts
    Pages --> Components
    Pages --> API
    API --> Backend[/Django API/]
```

Key frontend ideas:

- React Router controls public and protected routes.
- Pages are lazy-loaded to reduce the initial bundle.
- Axios centralizes API base URL, cookies, CSRF, and token refresh.
- Auth context exposes role, plan, trial, and lock state.
- UI route protection helps user experience, but backend permissions remain the real security boundary.

## 15. Operational View

```mermaid
flowchart TB
    Commit[Git commit]
    Deploy[Deploy platform]
    Release[Release command]
    Migrate[Run migrations]
    Static[Collect static]
    Schedules[Setup Django Q schedules]
    Web[Start Gunicorn web service]
    Worker[Start Django Q worker]
    Monitor[Monitor logs and Sentry]

    Commit --> Deploy
    Deploy --> Release
    Release --> Migrate
    Release --> Static
    Release --> Schedules
    Deploy --> Web
    Deploy --> Worker
    Web --> Monitor
    Worker --> Monitor
```

What to say in meetings:

> Deployment has two responsibilities: release preparation and runtime processes.
> Release preparation runs migrations, static collection, and schedule setup. Runtime
> starts the web server and worker. For subscription incidents, we can also run
> reconciliation as a controlled operational command.

## 16. Architecture Learning Roadmap

```mermaid
flowchart LR
    A[1. Product domain]
    B[2. Data model]
    C[3. API request lifecycle]
    D[4. Auth and permissions]
    E[5. Transactions and consistency]
    F[6. Billing and webhooks]
    G[7. Background jobs]
    H[8. Deployment and operations]
    I[9. Scaling and tradeoffs]

    A --> B --> C --> D --> E --> F --> G --> H --> I
```

Study order:

1. Product domain: explain what problem the app solves for repair shops.
2. Data model: understand `Shop` as the tenant root.
3. API lifecycle: trace one request from React to Django to PostgreSQL.
4. Auth and permissions: explain cookies, CSRF, roles, plans, and tenant scoping.
5. Transactions: trace sale creation and stock deduction.
6. Billing: trace Paystack checkout, webhook, callback, and reconciliation.
7. Background jobs: understand notifications and schedules.
8. Deployment: understand Nginx, Gunicorn, PostgreSQL, and Django Q2.
9. Scaling: discuss bottlenecks and future improvements.

## 17. Interview Question Bank

### What architecture does this app use?

> It uses a React SPA plus a Django REST API. The backend is a modular monolith:
> one deployable backend, one database, but separated internally by Django apps for
> each business domain.

### Why not microservices?

> Microservices would add deployment, networking, observability, and data-consistency
> complexity before the product needs it. A modular monolith gives clean boundaries
> while keeping transactions and operations simpler.

### How do you isolate tenant data?

> Each user belongs to a shop, and business records belong to a shop. Querysets are
> filtered by the authenticated user's shop. This prevents cross-shop access.

### How do you prevent overselling stock?

> Sale creation runs in a database transaction and locks product rows with
> `select_for_update`. If validation fails, the entire transaction rolls back.

### Why use HttpOnly cookies for JWTs?

> HttpOnly cookies reduce the risk of JavaScript stealing tokens during XSS. Because
> cookies are automatically sent by browsers, the API also enforces CSRF protection.

### What happens if Paystack renewal succeeds but the app does not unlock the user?

> The normal path is a signed webhook updating the subscription period. If that path
> fails, the reconciliation command compares local records with Paystack and updates
> local access based on the active remote subscription.

### What would you improve next?

> I would add a durable webhook event inbox, more frontend tests, stricter dependency
> pinning, service-layer extraction for complex business workflows, and stronger
> reporting scalability through cached summaries or materialized reporting tables.

## 18. Mental Model To Keep

```mermaid
mindmap
  root((Giztrack))
    Users
      Admin
      Staff
      Technician
    Tenant
      Shop
      Scoped data
      Role permissions
    Operations
      Sales
      Inventory
      Repairs
      Suppliers
      Expenses
    Money
      Paystack
      Subscriptions
      Payment history
      Credit sales
    Reliability
      Transactions
      Stock logs
      Reconciliation
      Tests
    Platform
      React
      Django REST
      PostgreSQL
      Django Q2
      Docker
```

Final interview framing:

> I understand the app as a layered SaaS system. The frontend is responsible for
> user workflows. The API owns business rules. PostgreSQL is the source of truth.
> Shop scoping protects tenant data. Transactions protect inventory and money flows.
> Paystack and Django Q2 handle external billing and async work. The architecture is
> intentionally a modular monolith because that is the right complexity level for
> this product stage.

