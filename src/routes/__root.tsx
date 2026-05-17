import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Atlas — Decision Enforcement System" },
      {
        name: "description",
        content:
          "Atlas: a decision enforcement system. Permanent record of architectural decisions, costs, and bought lessons.",
      },
    ],
  }),
  shellComponent: RootShell,
  component: () => <Outlet />,
  notFoundComponent: () => null,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: "#0D0B09" }}>
      <head>
        <HeadContent />
        <style>{`html,body{background:#0D0B09 !important;}`}</style>
      </head>
      <body style={{ background: "#0D0B09" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
