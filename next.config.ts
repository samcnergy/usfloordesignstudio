import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Render runs Next.js behind a reverse proxy; list the public host so
      // server action origin checks pass.
      allowedOrigins: ["usfloordesignstudio.onrender.com"],
    },
  },
};

export default nextConfig;
