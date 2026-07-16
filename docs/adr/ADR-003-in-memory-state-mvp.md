# ADR-003: Estado en memoria para el MVP de chat (sin base de datos)

## Estado

Aceptado — temporal, revisado cuando se implemente persistencia (fase futura).

## Contexto

El MVP de chat en tiempo real (Fase 2) necesita rastrear qué usuarios están conectados y
hacer broadcast de mensajes entre ellos. Todavía no existe PostgreSQL ni Prisma en el
proyecto (excluidos explícitamente del alcance de esta fase).

## Decisión

El estado de la sala (usuarios conectados, límite de frecuencia de mensajes por socket) se
mantiene **en memoria del proceso de `apps/api`**, en la clase `RoomState`
(`apps/api/src/roomState.ts`), usando `Map` indexados por `socket.id`.

Implicaciones explícitas de esta decisión:

- **No hay persistencia**: los mensajes y la lista de usuarios se pierden por completo si el
  proceso de la API se reinicia. Esto es el comportamiento esperado del MVP, no un defecto.
- **No escala horizontalmente**: si en el futuro se ejecuta más de una instancia de `apps/api`
  (por ejemplo, varios pods en Kubernetes), cada instancia tendría su propio estado
  desincronizado. Esta decisión asume una sola instancia de proceso, apropiada para
  desarrollo local.
- **Nombres de usuario duplicados están permitidos**: el MVP no valida unicidad de nombre,
  solo longitud y que no esté vacío. Dos usuarios pueden conectarse con el mismo nombre sin
  error. Se documenta aquí explícitamente como limitación conocida, no como bug.

## Alternativas consideradas

- **PostgreSQL + Prisma desde el inicio**: descartado para esta fase por alcance — el objetivo
  de la Fase 2 es validar el flujo de tiempo real (Socket.IO) de punta a punta, no el modelo
  de persistencia. Se abordará en una fase posterior.
- **Redis para estado compartido**: descartado por la misma razón; añade una pieza de
  infraestructura innecesaria para un MVP de un solo proceso.

## Consecuencias

- Cuando se agregue persistencia (fase futura), esta ADR debe marcarse como superada y
  reemplazada, y `RoomState` deberá delegar a una capa de datos en lugar de `Map` en memoria.
- Cualquier prueba de carga o demo prolongada debe asumir que un reinicio del proceso de la
  API borra todo el historial y la lista de usuarios conectados.
