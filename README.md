# fitly

Build the backend foundation for a multi-tenant business management SaaS platform (for gyms, fitness studios, and coaches). Do NOT build any booking, payment, or chatbot features yet — this prompt is ONLY for the database schema, authentication, and role-based access.

1. Enable Lovable Cloud (built-in Supabase backend).

2. Create these database tables with the exact fields below:

businesses

id (uuid, primary key)

owner_id (uuid, references users)

name (text)

business_type (text)

slug (text, unique)

logo_url (text, nullable)

brand_color (text, nullable)

settings (jsonb, default empty object)

subscription_status (text, default 'trial')

language_default (text, default 'ar')

created_at (timestamptz, default now)

users (extend Supabase auth users with a profile table)

id (uuid, primary key, references auth.users)

email (text)

full_name (text)

role (text) — must be one of: 'platform_admin', 'business_owner', 'staff', 'client'

phone (text, nullable)

preferred_language (text, default 'ar')

created_at (timestamptz, default now)

staff

id (uuid, primary key)

business_id (uuid, references businesses)

user_id (uuid, references users)

specialties (text array, nullable)

bio (text, nullable)

is_active (boolean, default true)

created_at (timestamptz, default now)

clients

id (uuid, primary key)

business_id (uuid, references businesses)

user_id (uuid, references users, nullable)

notes (text, nullable)

created_at (timestamptz, default now)

3. Authentication requirements:

Email/password signup and login

After signup, automatically create a row in the users profile table

Default role on signup = 'business_owner' (for now — we will add client/staff signup flows later)

Add a working logout button

Add route protection: unauthenticated users cannot access any dashboard page

4. Row Level Security (RLS) — apply these rules:

A business_owner can only read/write rows in businesses, staff, and clients where business_id matches a business they own

A platform_admin can read all rows in all tables

Regular authenticated users with no business cannot see any business data

5. Build ONLY these pages for now:

/signup — signup form (email, password, full name)

/login — login form

/onboarding — after signup, a simple form to create their first business (name, business_type dropdown with options: "Gym", "Studio", "Coaching")

/dashboard — a blank protected page that just shows "Welcome, [business name]" after login, to confirm auth + business creation works

✅ Acceptance Criteria (Definition of Done):

 I can sign up with email/password

 After signup, I land on /onboarding and can create a business

 After creating a business, I land on /dashboard and see the business name

 I can log out and log back in, and still see my business

 If I open the app in an incognito window without logging in, I am redirected to /login

 All 4 tables exist in the database with the exact fields listed above

Do not add any other pages, features, or UI beyond what is listed above. Keep the design simple and clean — we will build the full design system in the next phase.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://grow-roots-engine.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/325a9bc5-9c83-4db9-a2b4-fa9b804ba908).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
