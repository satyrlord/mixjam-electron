/**
 * Playwright global setup. Starts the vite preview server (production build)
 * so e2e tests run against the same bundle that ships to users. The server is
 * torn down in globalTeardown.
 */
async function globalSetup(): Promise<void> {
  // The vite preview server is started by the npm script (see package.json
  // "test:e2e" / "test:e2e:electron"). Nothing to do here.
}

export default globalSetup
