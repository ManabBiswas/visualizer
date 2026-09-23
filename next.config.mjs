/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["libsql", "web-tree-sitter"],
  outputFileTracingIncludes: {
    // Python grammar WASM is read from disk at runtime (Language.load path)
    // — trace it into the serverless bundle so /api/analyze works on Vercel.
    "/api/analyze": ["./lib/parser/wasm/*.wasm"],
  },
  // Security headers (CSP, X-Frame-Options, HSTS, …) live solely in proxy.ts —
  // the Next 16 middleware is the single source of truth and is NODE_ENV-aware.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
