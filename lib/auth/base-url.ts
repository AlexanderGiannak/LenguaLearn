// The app's public URL, which Better Auth uses for links and as the one trusted origin.
//
// Railway PR environments copy production's variables, so they would inherit
// BETTER_AUTH_URL (the custom domain) and refuse their own sign-ins. A PR environment
// always uses its own generated domain instead.
export function authBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const generated = env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : null;
  const isPreview = /-pr-\d+$/.test(env.RAILWAY_ENVIRONMENT_NAME ?? "");
  if (isPreview && generated) return generated;
  return env.BETTER_AUTH_URL || generated || "http://localhost:3000";
}
