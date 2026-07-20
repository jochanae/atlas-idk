import type { RepositoryClassificationInput } from "../../types.js";

/**
 * Fixture E — Expo / React Native mobile app.
 *
 * No web dev server, mobile-only entry points.
 *
 * Expected:
 *   - repositoryType "mobile"
 *   - overallStatus "unsupported"
 *   - previewStrategy "unsupported"
 *   - Warning explaining why mobile is unsupported in Atlas's current runtime
 */
export const fixtureExpoMobile: RepositoryClassificationInput = {
  repositoryRoot: "/workspace",
  sourceMode: "local-complete",
  files: [
    {
      path: "package.json",
      content: JSON.stringify({
        name: "my-expo-app",
        private: true,
        scripts: {
          start: "expo start",
          android: "expo run:android",
          ios: "expo run:ios",
          web: "expo start --web",
        },
        dependencies: {
          expo: "~51.0.0",
          "expo-router": "~3.5.0",
          react: "18.2.0",
          "react-native": "0.74.0",
        },
        devDependencies: {
          "@babel/core": "^7.20.0",
          "@types/react": "~18.2.45",
          typescript: "^5.1.3",
        },
      }),
    },
    {
      path: "app.json",
      content: JSON.stringify({
        expo: {
          name: "my-expo-app",
          slug: "my-expo-app",
          version: "1.0.0",
          orientation: "portrait",
          platforms: ["ios", "android"],
          sdkVersion: "51.0.0",
        },
      }),
    },
    {
      path: "app/_layout.tsx",
      content: `import { Stack } from 'expo-router';\nexport default function Layout() { return <Stack />; }\n`,
    },
    {
      path: "app/index.tsx",
      content: `import { Text, View } from 'react-native';\nexport default function Home() { return <View><Text>Home</Text></View>; }\n`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify({ extends: "expo/tsconfig.base" }),
    },
  ],
};
