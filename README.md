# HVAC Maintenance Membership Platform

A comprehensive web platform for managing HVAC maintenance memberships, customer relationships, and service scheduling.

## Features

### Customer-Facing Features
- **Marketing Landing Page**: Persuasive homepage highlighting the Free Work List and comprehensive tune-up checklist
- **Maintenance Plans**: Clear presentation of available membership plans with pricing and benefits
- **Secure Checkout**: Complete purchase flow with customer information collection and electronic agreement signing
- **Customer Dashboard**:
  - View current membership details
  - Track remaining tune-ups and benefits
  - Access complete service history
  - View past work completed and recommendations

### Admin Features
- **Customer Management**: View and manage all customer accounts and memberships
- **Plan Management**: Control maintenance plan details, pricing, and activation status
- **Service Tracking**: Record and manage completed services for customers
- **Content Management**: Edit marketing content and page copy through the admin interface

### Key Differentiators
- **Free Work List**: Shows customers exactly what maintenance tasks are included at no extra charge
- **Transparent Tune-Up Checklist**: Detailed breakdown of all inspection and maintenance items
- **Example Service Summaries**: Clear reporting of work completed and recommendations

## Tech Stack

- **Frontend**: React 19 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v7
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: CSS Modules

## Database Schema

### Tables
- `customers`: Customer profile information
- `maintenance_plans`: Available maintenance plans with pricing and features
- `customer_memberships`: Links customers to their purchased plans
- `services_completed`: Historical record of all services provided
- `tune_up_checklist_items`: Standard checklist items for tune-ups
- `content_pages`: Admin-editable marketing content
- `membership_agreements`: Terms and conditions customers agree to

## Getting Started

The application is already configured and ready to use. The database includes:
- 2 sample maintenance plans (Basic and Premium)
- Default tune-up checklist items
- Sample marketing content
- Membership agreement template

### Customer Workflow
1. Browse plans on the homepage
2. Select a plan and proceed to checkout
3. Enter contact and service address information
4. Review and agree to membership terms
5. Complete purchase (payment integration placeholder ready for Stripe)
6. Access dashboard to view membership details and service history

### Admin Workflow
1. Log in with admin credentials
2. Access admin panel at `/admin`
3. Manage customers, plans, services, and content
4. Add new services and track customer interactions

## Payment Integration (Stripe Subscriptions)

The checkout page now starts a **Stripe Checkout subscription session** for annual recurring billing. Card details are collected securely on Stripe-hosted pages (not in your app).

### 1) Create your Stripe account
1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Verify your email and enable 2FA.
3. In Stripe Dashboard, complete business details under **Settings → Business details**.
4. Add bank account and payout details under **Settings → Bank accounts and scheduling**.
5. Until fully activated, you can still test in **Test mode**.

### 2) Create recurring yearly prices in Stripe
1. Open **Product Catalog** in Stripe.
2. Create one Product for each maintenance plan.
3. For each product, create a **Recurring** price with interval **Yearly**.
4. Copy each `price_...` ID.

### 3) Save Stripe price IDs in Supabase
Add `stripe_price_id` to each row in `maintenance_plans`:

```sql
alter table maintenance_plans
add column if not exists stripe_price_id text;
```

Then set each plan's `stripe_price_id` with the yearly `price_...` from Stripe.

### 4) Deploy the Supabase Edge Function
This repo includes `supabase/functions/create-checkout-session/index.ts`.

Set secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...  SUPABASE_SERVICE_ROLE_KEY=...  SITE_URL=https://your-site-url.com
```

Deploy function:

```bash
supabase functions deploy create-checkout-session
```

### 5) Recommended next step (webhook)
For production, add a Stripe webhook (`checkout.session.completed` and subscription events) to create/update `customer_memberships` only after confirmed payment.
<<<<<<< codex/add-stripe-for-recurring-payments-e7syit


### Mini Split head-count pricing (4 to 9 heads)
The checkout now supports Mini Split pricing by head count. If the plan name contains `mini split`, users will choose 4–9 heads at checkout and Stripe will use the matching yearly recurring `price_...` ID.

Configured tiers:
- 4 heads: $340
- 5 heads: $400
- 6 heads: $450
- 7 heads: $475
- 8 heads: $500
- 9 heads: $525

> Important: confirm each Stripe price ID in `src/lib/miniSplitPricing.ts` and `supabase/functions/create-checkout-session/index.ts` exactly matches your Stripe dashboard values.


### Common Error: CORS blocked on `create-checkout-session`
If you see `blocked by CORS policy` in browser console:

1. Confirm the Edge Function exists in the **same Supabase project** used by `VITE_SUPABASE_URL`.
2. Redeploy after code changes:
   ```bash
   supabase functions deploy create-checkout-session
   ```
3. Verify function name is exact: `create-checkout-session` (spelling + hyphens).
4. Ensure function secrets are set:
   - `STRIPE_SECRET_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SITE_URL`
5. In browser DevTools, test preflight manually:
   ```bash
   curl -i -X OPTIONS https://<project-ref>.supabase.co/functions/v1/create-checkout-session \
     -H "Origin: https://your-site.com" \
     -H "Access-Control-Request-Method: POST"
   ```
   You should see `Access-Control-Allow-Origin` in the response.

If the function is missing/not deployed, Supabase can return a non-CORS response and the browser shows a CORS error even though the root issue is deployment/configuration.
=======
>>>>>>> main

## Security

- Row Level Security (RLS) enabled on all database tables
- Customers can only access their own data
- Admin users have full access to manage all platform data
- Authentication handled securely through Supabase Auth

## Design Principles

- Clean, professional interface with blue and green color scheme
- Responsive design that works on all devices
- Clear visual hierarchy and readable typography
- Intuitive navigation and user flows
- Accessibility-focused form design

## Next Steps

1. **Set Up Admin User**: Create an admin user account in Supabase and set `raw_app_meta_data->>'role'` to `'admin'`
2. **Configure Stripe**: Add Stripe credentials for payment processing
3. **Customize Content**: Use the admin panel to edit marketing content
4. **Add Company Branding**: Update logo and color scheme as needed
5. **Deploy**: Deploy to your preferred hosting platform

## Support

For technical support or questions about the platform, refer to the inline code documentation or contact your development team.
