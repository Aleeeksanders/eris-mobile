import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { StatusBar } from 'expo-status-bar';
import ChatScreen from './src/screens/ChatScreen';

const Drawer = createDrawerNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Drawer.Navigator
        initialRouteName="Chat"
        screenOptions={{
          headerStyle: { backgroundColor: '#1e1e2e' },
          headerTintColor: '#cdd6f4',
          drawerStyle: { backgroundColor: '#11111b' },
          drawerActiveTintColor: '#89b4fa',
          drawerInactiveTintColor: '#a6adc8',
        }}
      >
        <Drawer.Screen 
          name="Chat" 
          component={ChatScreen} 
          options={{ title: 'Eris Core' }}
        />
        {/* Aquí luego inyectaremos dinámicamente los "Proyectos/Sesiones" del JSON */}
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
