import { buildPostAuthRedirectPath, isAuthCallbackUrl } from "@/lib/auth-callback";

describe("auth callback helpers", () => {
  it("detects supported callback URLs", () => {
    expect(isAuthCallbackUrl("https://soma-edu.com/auth/callback?code=abc")).toBe(true);
    expect(isAuthCallbackUrl("soma://auth/callback#access_token=1")).toBe(true);
    expect(isAuthCallbackUrl("soma:///auth/callback#access_token=1")).toBe(true);
    expect(isAuthCallbackUrl("https://soma-edu.com/login")).toBe(false);
  });

  it("builds deterministic post-auth paths", () => {
    expect(buildPostAuthRedirectPath(true, true)).toBe("/decks?app=1");
    expect(buildPostAuthRedirectPath(true, false)).toBe("/login?app=1");
    expect(buildPostAuthRedirectPath(false, true)).toBe("/decks");
    expect(buildPostAuthRedirectPath(false, false)).toBe("/login");
  });
});

