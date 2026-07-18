import { Tabs } from 'expo-router';
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: '#9B8AB5',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E8E0F0',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarLabel: 'Today',
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: 'Food',
          tabBarLabel: 'Food',
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'Timeline',
          tabBarLabel: 'Timeline',
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarLabel: 'Insights',
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: 'Export',
          tabBarLabel: 'Export',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
        }}
      />
    </Tabs>
  );
}
