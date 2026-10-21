import { isPlaceholderEmail } from "@/lib/auth/identifiers";

// Outgoing email: teacher and learner verification and password resets only (spec: Email).
// Production will send through AWS SES once the domain and AWS account exist; until then
// only the development transport is available, which prints to the server console.

export type Email = { to: string; subject: string; text: string };

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not configured on this server yet.");
  }
}

/** Messages sent by the console transport, for tests. */
export const sentInDevelopment: Email[] = [];

export async function sendEmail(email: Email): Promise<void> {
  // Placeholder addresses (class students, username-only learners) can never get mail.
  if (isPlaceholderEmail(email.to)) throw new Error("refusing to email a placeholder address");

  const transport =
    process.env.EMAIL_TRANSPORT ?? (process.env.NODE_ENV === "production" ? "none" : "console");
  if (transport === "console") {
    sentInDevelopment.push(email);
    if (sentInDevelopment.length > 50) sentInDevelopment.shift();
    console.info(`[email] to ${email.to}: ${email.subject}\n${email.text}`);
    return;
  }
  throw new EmailNotConfiguredError();
}
