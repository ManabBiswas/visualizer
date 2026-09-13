/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["libsql", "web-tree-sitter"],
  outputFileTracingIncludes: {
    // Python grammar WASM is read from disk at runtime (Language.load path)
    // — trace it into the serverless bundle so /api/analyze works on Vercel.
    "/api/analyze": ["./lib/parser/wasm/*.wasm"],
  },
};

export default nextConfig;
