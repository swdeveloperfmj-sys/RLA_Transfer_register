# Location Access Portal

Responsive role-based login and dashboard. Super admins can create normal users and assign one or more locations.

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` and `JWT_SECRET`.
2. Run `npm install` then `npm run install:all`.
3. Seed the first super admin with `npm run seed --prefix backend`.
4. Run `npm run dev` and open the frontend URL shown in the terminal.

## Workflow notifications

Every transport status change creates a dashboard alert for each active user at the affected location and sends the same alert by email. Add the SMTP values from `backend/.env.example` to `backend/.env` to enable email delivery. Dashboard alerts use `react-hot-toast` and check for updates every 20 seconds while the user is signed in.

To enable Textware SMS notifications as well, add the `TEXTWARE_SMS_*` values from the same example file and set `TEXTWARE_SMS_ENABLED=true`. Each user must have a mobile number; Sri Lankan `07xxxxxxxx` numbers are automatically sent to Textware as `947xxxxxxxx`.

## Invoice storage on Vercel

Invoices are stored in Cloudflare R2 rather than the Vercel server filesystem. Create an R2 bucket, an Object Read & Write API token scoped to that bucket, and configure the `R2_*` variables in `backend/.env` and Vercel. Set `R2_PUBLIC_URL` to the bucket's custom public domain (recommended) or its `r2.dev` URL. Server-side uploads remain limited to 4 MB because of the Vercel Function request limit.
