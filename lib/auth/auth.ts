import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { getDb } from "@/lib/db/client";
import { account, session, user, verification } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import { hasAgeConfirmation } from "./age";
import { authBaseUrl } from "./base-url";
import { isPlaceholderEmail } from "./identifiers";

// Better Auth setup (spec: Decisions, Auth; Accounts and privacy).
//
// Sign-up and sign-in go through the app's own routes (lib/auth/routes.ts), which apply the
// per-handle, per-seat-code and per-device limits and then call Better Auth on the server.
// Their public Better Auth endpoints are disabled, along with endpoints that could put
// personal data on a class student's account (update-user, change-email, link-social).

// OWASP's recommended Argon2id settings: 19 MiB memory, 2 passes, 1 lane.
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export { authBaseUrl };

export function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && !process.env.CI) {
    throw new Error("BETTER_AUTH_SECRET is not set");
  }
  // Local development and tests only.
  return "development-only-secret-not-for-production-use";
}

function createAuth() {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account" as const,
          },
        }
      : {};

  return betterAuth({
    baseURL: authBaseUrl(),
    secret: authSecret(),
    trustedOrigins: [authBaseUrl()],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    telemetry: { enabled: false },
    // Our own limiter runs in front of sign-in (lib/auth/limits.ts); Better Auth's keys on IP.
    rateLimit: { enabled: false },
    advanced: {
      // Spec: IP addresses are never stored. Rate limiting uses them in memory only.
      ipAddress: { disableIpTracking: true },
      useSecureCookies: authBaseUrl().startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    disabledPaths: [
      "/sign-in/email",
      "/sign-in/username",
      "/sign-up/email",
      "/update-user",
      "/change-email",
      "/link-social",
      "/delete-user",
      "/is-username-available",
    ],
    user: {
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "learner" },
      },
    },
    account: { accountLinking: { enabled: false } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
      sendResetPassword: async ({ user: u, url }) => {
        if (isPlaceholderEmail(u.email)) return;
        await sendEmail({
          to: u.email,
          subject: "Reset your LenguaLearn password",
          text: `Use this link to choose a new password. It expires in an hour.\n\n${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        // Class students and username-only learners have no real address to verify.
        if (isPlaceholderEmail(u.email)) return;
        await sendEmail({
          to: u.email,
          subject: "Confirm your email for LenguaLearn",
          text: `Confirm your email address to finish setting up your account.\n\n${url}`,
        });
      },
    },
    socialProviders: google,
    databaseHooks: {
      user: {
        create: {
          // A Google sign-up (the OAuth callback) needs the 13-or-older confirmation from
          // the sign-up page. The app's own sign-up routes record it themselves.
          before: async (u, ctx) => {
            if (!ctx?.path?.startsWith("/callback")) return;
            const cookie = ctx.request?.headers.get("cookie") ?? ctx.headers?.get("cookie") ?? null;
            if (!hasAgeConfirmation(cookie, authSecret())) return false;
            return { data: { ...u, ageConfirmedAt: new Date() } };
          },
        },
      },
      // Belt and braces with the database check: never keep an IP or user agent.
      session: {
        create: {
          before: async (s) => ({ data: { ...s, ipAddress: null, userAgent: null } }),
        },
        update: {
          before: async (s) => ({ data: { ...s, ipAddress: null, userAgent: null } }),
        },
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        // Handles look like quiet-otter-42, so dashes are allowed.
        usernameValidator: (name) => /^[a-z0-9_.-]+$/i.test(name),
      }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { auth?: Auth };

/** Created on first use, so `next build` never needs a database or secret. */
export function getAuth(): Auth {
  g.auth ??= createAuth();
  return g.auth;
}
