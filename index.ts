// Primero: lo que se guarda en el teléfono queda separado por cuenta (debe instalarse antes de que nada lea o escriba)
import './src/services/ScopedStorage';
import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Eris administra (A0): con la app cerrada, el aviso del banco despierta esta tarea (BankHeadlessService.kt) y Eris anota
// lo claro sin abrir pantallas
AppRegistry.registerHeadlessTask('ErisBankAuto', () => () => require('./src/services/finance/financeAuto').runBankHeadless());
