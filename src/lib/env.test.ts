import { getSiteUrl } from "@/lib/env";

describe("getSiteUrl", () => {
  const originalSite = process.env.NEXT_PUBLIC_SITE_URL;
  const originalVercel = process.env.VERCEL_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSite;
    process.env.VERCEL_URL = originalVercel;
  });

  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://soma-edu.com/";
    process.env.VERCEL_URL = "preview.soma-edu.com";

    expect(getSiteUrl()).toBe("https://soma-edu.com");
  });

  it("falls back to VERCEL_URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "preview.soma-edu.com";

    expect(getSiteUrl()).toBe("https://preview.soma-edu.com");
  });

  it("falls back to localhost when no env exists", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;

    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});

