# Location Access Portal

Responsive role-based login and dashboard. Super admins can create normal users and assign one or more locations.

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` and `JWT_SECRET`.
2. Run `npm install` then `npm run install:all`.
3. Seed the first super admin with `npm run seed --prefix backend`.
4. Run `npm run dev` and open the frontend URL shown in the terminal.
