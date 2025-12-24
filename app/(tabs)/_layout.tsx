import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import React from "react";
import { t } from "@/utils/i18n";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#ffd33d",
        headerStyle: {
          backgroundColor: "#25292e",
        },
        headerShadowVisible: false,
        headerTintColor: "#fff",
        tabBarStyle: {
          backgroundColor: "#25292e",
        },
      }}>
      <Tabs.Screen
        name="temp"
        options={{
          title: t("tabs.tasks"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "bookmarks" : "bookmarks-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="user"
        options={{
          title: t("tabs.vehicles"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "car-sport" : "car-sport-outline"} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="warehouse"
        options={{
          title: t("tabs.warehouse"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "layers" : "layers-outline"} color={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
