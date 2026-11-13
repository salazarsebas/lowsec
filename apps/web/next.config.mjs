/** The web app talks only to /api/* on its own origin; Next proxies it to the Node service
 *  (relayer + agents). Locally that is http://localhost:8787; when hosted (e.g. Vercel) set
 *  LOWSEC_SERVER_URL to the public URL of apps/server. */
const server = process.env.LOWSEC_SERVER_URL ?? "http://localhost:8787";
export default {
  // the Fast-forward runs the same headless sim in the browser (TypeScript source, workspace package)
  transpilePackages: ["@lowsec/sim"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${server}/api/:path*` }];
  },
};
