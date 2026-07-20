import type { RepositoryClassificationInput } from "../../types.js";

/**
 * Fixture C — Next.js fullstack app with Prisma.
 *
 * DATABASE_URL is required to boot because Prisma client initializes at import
 * time (the schema's generate output is imported in the boot path). The fixture
 * encodes this explicitly via a src/db.ts that imports PrismaClient at module
 * level, which Next.js loads on server startup.
 *
 * Expected:
 *   - repositoryType "single-app"
 *   - overallStatus "configuration-required"
 *   - One fullstack target, status "configuration-required"
 *   - DATABASE_URL: classification "required-to-boot", sensitivity "secret"
 *   - PostgreSQL external service detected
 */
export const fixtureNextjsPrisma: RepositoryClassificationInput = {
  repositoryRoot: "/workspace",
  sourceMode: "local-complete",
  files: [
    {
      path: "package.json",
      content: JSON.stringify({
        name: "my-nextjs-app",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
        },
        dependencies: {
          next: "^14.2.0",
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          "@prisma/client": "^5.13.0",
        },
        devDependencies: { prisma: "^5.13.0", typescript: "^5.5.3" },
      }),
    },
    {
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */\nmodule.exports = {};\n`,
    },
    {
      path: "prisma/schema.prisma",
      content: `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n`,
    },
    {
      path: "src/db.ts",
      content: `import { PrismaClient } from '@prisma/client';\nexport const prisma = new PrismaClient();\n`,
    },
    {
      path: "src/pages/_app.tsx",
      content: `import type { AppProps } from 'next/app';\nexport default function App({ Component, pageProps }: AppProps) {\n  return <Component {...pageProps} />;\n}\n`,
    },
    {
      path: ".env.example",
      content: `DATABASE_URL=postgresql://localhost:5432/mydb\n`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify({
        compilerOptions: { target: "ES2020", jsx: "react-jsx", module: "ESNext" },
      }),
    },
  ],
};
