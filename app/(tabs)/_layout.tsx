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
    </Tabs>
  );
}
