import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useEffect } from "react";

import { useColorScheme } from "@/hooks/useColorScheme";
import "@/utils/mqtt";
import { initializeI18n } from "@/utils/i18n";
import { defaultConfig } from "@tamagui/config/v4";
import { createTamagui, TamaguiProvider } from "tamagui";

const config = createTamagui(defaultConfig);

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  // 初始化国际化
  useEffect(() => {
    initializeI18n();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <TamaguiProvider config={config}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </TamaguiProvider>
  );
}
