export type AirTokenUser = {
  id: string;
  email?: string;
  operations: Array<"issue" | "verify" | "login">;
};

// Replace this adapter with the application's verified session or validated AIR
// login token, and its authorization policy. Check request origin/CSRF for cookie
// sessions. Never trust an email, user ID, or permissions supplied in the body.
// The default denies all requests until the application's integration is complete.
export async function authorizeAirToken(_request: Request): Promise<AirTokenUser | null> {
  return null;
}
