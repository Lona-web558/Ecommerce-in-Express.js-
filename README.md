# Enterprise E-commerce Backend

Full-stack e-commerce backend built with **Node.js + Express**, JSON-file storage, and a **Bootstrap 5** storefront + admin panel. Covers every feature from the spec: auth, product catalog, categories, inventory management, coupons, orders, payments (Stripe), reviews, admin dashboard API, wishlist, cart, image uploads, email notifications, and sales analytics.

## Quick start

```bash
npm install
cp .env.example .env    # then fill in your own values
npm start                # or: npm run dev (with nodemon)
```

Visit:
- Storefront: `http://localhost:5000/`
- Admin panel: `http://localhost:5000/admin`

## First admin account

1. Register a normal account on the storefront (top-right "Login" → Register tab).
2. Set `ADMIN_KEY` in your `.env` file to any secret string.
3. Go to `/admin`, scroll to "First time setup", enter your `ADMIN_KEY` and the email you registered with, click **Promote to Admin**.
4. Log in on the same page with that email/password — you're now in the admin panel.

Keep `ADMIN_KEY` secret; anyone with it can promote any registered email to admin.

## What's included

| Feature | Where |
|---|---|
| Authentication (JWT, bcrypt) | `routes/auth.js` |
| Product catalog + search/filter/sort/pagination | `routes/products.js` |
| Categories | `routes/categories.js` |
| Inventory management | `PATCH /api/products/:id/inventory` |
| Coupons (percent/fixed, limits, expiry) | `routes/coupons.js` |
| Cart | `routes/cart.js` |
| Wishlist | `routes/wishlist.js` |
| Orders + status lifecycle | `routes/orders.js` |
| Payments (Stripe PaymentIntents + webhook) | `routes/payments.js` |
| Reviews + moderation | `routes/reviews.js` |
| Admin dashboard API | `routes/admin.js` |
| Sales analytics (revenue over time, top products, top customers) | `routes/analytics.js` |
| Image uploads | `middleware/upload.js`, `POST /api/products/upload-image` |
| Email notifications (order confirmation) | `utils/mailer.js` |

## Configuring Stripe (real payments)

Without Stripe configured, checkout runs in **demo mode**: orders are created and can be confirmed with one click, no card required — useful for testing the full flow immediately.

To take real payments:
1. Get your keys from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys).
2. Set `STRIPE_SECRET_KEY` in `.env`.
3. Open `public/js/store.js` and set `STRIPE_PUBLISHABLE_KEY` near the bottom of the file to your `pk_...` key.
4. For the webhook (`POST /api/payments/webhook`), use the [Stripe CLI](https://stripe.com/docs/stripe-cli) locally (`stripe listen --forward-to localhost:5000/api/payments/webhook`) and set `STRIPE_WEBHOOK_SECRET` from its output. In production, add the webhook endpoint in the Stripe Dashboard and use the signing secret it gives you.

## Configuring email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` in `.env`. If you use Gmail, you'll need an **App Password**, not your regular password. If SMTP isn't configured, emails are just logged to the console instead of failing — safe for local dev.

## ⚠️ Important: image uploads on Render

This backend saves uploaded product images to a local `/uploads` folder by default. **Render's filesystem is ephemeral** — anything written to disk is wiped on every redeploy or restart, so uploaded images will disappear. (You may recognize this from other projects.)

For production on Render, do one of:
- Paste an external image URL in the product form instead of uploading a file, or
- Wire up Cloudinary or S3 for uploads (the "Extras" list in your spec mentions Cloudinary/S3) — `middleware/upload.js` is the only file you'd need to swap out to add that.
- Attach a Render persistent disk to the service and point `UPLOAD_DIR` at it.

## Data storage

All data lives as JSON files in `/data` (`users.json`, `products.json`, etc.) — same pattern as your other projects. This keeps things simple and dependency-free, but note:
- It's fine for a personal project or small store, but not built for concurrent high-traffic writes.
- On Render specifically, the `/data` folder is also ephemeral unless you attach a persistent disk — back up `/data` before redeploying, or migrate to a real database (Postgres, MongoDB) if this goes into real production use.

## API overview

All endpoints are under `/api`. Protected routes require `Authorization: Bearer <token>`. Admin-only routes additionally require the logged-in user's role to be `admin`.

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/products`, `GET /api/products/:id`, `POST/PUT/DELETE /api/products/:id` (admin)
- `PATCH /api/products/:id/inventory` (admin)
- `GET /api/categories`, `POST/PUT/DELETE /api/categories/:id` (admin)
- `POST /api/coupons/validate`, full CRUD for admin
- `GET/POST/PUT/DELETE /api/cart/items/:productId`
- `GET/POST/DELETE /api/wishlist/:productId`
- `GET /api/reviews/product/:id`, `POST /api/reviews`
- `POST /api/payments/create-intent`, `POST /api/payments/webhook`
- `GET /api/orders`, `GET /api/orders/admin/all` (admin), `PATCH /api/orders/:id/status` (admin)
- `GET /api/admin/dashboard`, `GET /api/admin/users` (admin)
- `GET /api/analytics/sales`, `GET /api/analytics/top-products`, `GET /api/analytics/customers` (admin)

## Deploying to Render

1. Push this folder to a GitHub repo.
2. New Web Service on Render → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add all `.env` variables in Render's Environment tab.
5. See the image/data-persistence note above before relying on uploads in production.
