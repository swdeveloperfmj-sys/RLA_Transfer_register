# Location Access Portal

Responsive role-based login and dashboard. Super admins can create normal users and assign one or more locations.

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` and `JWT_SECRET`.
2. Run `npm install` then `npm run install:all`.
3. Seed the first super admin with `npm run seed --prefix backend`.
4. Run `npm run dev` and open the frontend URL shown in the terminal.

## Deploy the backend on Coolify

Deploy the backend as its own application with these settings:

- Base Directory: `/backend`
- Install Command: `npm ci`
- Build Command: leave empty (the backend runs plain JavaScript)
- Start Command: `npm start`
- Ports Exposes: `5000`
- Runtime environment: `PORT=5000`, `MONGODB_URI`, `JWT_SECRET`, and `CLIENT_URL` (the frontend origin, including `https://`, without a trailing slash or path)
- If health checks are enabled: HTTP GET `/api/health` on port `5000`

Local `.env` files are ignored by Git, so configure these variables in Coolify and redeploy. If choosing a different port, set both `PORT` and Ports Exposes to that same value.

The API connects to MongoDB before listening. Runtime logs should show `API listening on 0.0.0.0:5000`. If they stop at the connection message or report a MongoDB error, check the database URI, credentials, and network access from the Coolify server (including the server's outbound IP in MongoDB Atlas Network Access when using Atlas). A MongoDB instance on another container is not reachable through `localhost` in the API container.

After deployment, open `https://<backend-domain>/api/health`; it should return `{"status":"ok"}`. If the API reports that it is listening but the domain returns 502, check the proxy's target port and container status. See [Coolify's 502 troubleshooting guide](https://coolify.io/docs/troubleshoot/applications/bad-gateway).

## Workflow notifications

Every transfer status change creates a dashboard alert for each active user at the affected location and sends the same alert by email. Add the SMTP values from `backend/.env.example` to `backend/.env` to enable email delivery. Dashboard alerts use `react-hot-toast` and check for updates every 20 seconds while the user is signed in.

To enable Textware SMS notifications as well, add the `TEXTWARE_SMS_*` values from the same example file and set `TEXTWARE_SMS_ENABLED=true`. Each user must have a mobile number; Sri Lankan `07xxxxxxxx` numbers are automatically sent to Textware as `947xxxxxxxx`.

## Invoice storage on Vercel

Invoices are stored in Cloudflare R2 rather than the Vercel server filesystem. Create an R2 bucket, an Object Read & Write API token scoped to that bucket, and configure the `R2_*` variables in `backend/.env` and Vercel. Set `R2_PUBLIC_URL` to the bucket's custom public domain (recommended) or its `r2.dev` URL. Server-side uploads remain limited to 4 MB because of the Vercel Function request limit.
