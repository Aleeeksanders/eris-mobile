# Pruebas de la app de Eris

Se corren junto con las del servidor (desde `eris-mobile/` o `eris/`):

    bun run pruebas

React Native, AsyncStorage, las notificaciones y los módulos nativos están simulados (`mock.module`): estas pruebas cuidan
la lógica (Finanzas, Forge, Inventario, Sueño, avisos, metas). La pantalla, Android y Health Connect se prueban en el teléfono.
`fixtures/`: los datos de la versión web de Finanzas (migración y paridad) y una rutina escrita de ejemplo.
