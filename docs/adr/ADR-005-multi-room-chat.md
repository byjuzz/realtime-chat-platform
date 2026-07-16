# ADR-005: Chat con múltiples salas

## Estado

Aceptado

## Contexto

Hasta la Fase 3 solo existía la sala `general`, hardcodeada en el servidor. La Fase 4 convierte
el chat en un sistema funcional de múltiples salas: listar, crear, entrar, cambiar y salir de
salas, con presencia e historial aislados por sala.

## Decisiones

**Una sala activa por socket.** Un socket solo puede estar unido a una sala de Socket.IO a la
vez. Se apoya en las "rooms" nativas de Socket.IO (`socket.join`/`socket.leave`) para el
aislamiento de broadcast, evitando reimplementar enrutamiento manual.

**Presencia consolidada por `guestUserId`, sockets separados internamente.**
`RoomPresenceState` (en memoria, sin persistencia) mantiene `socketId → {guestUserId, roomId}`
y `roomId → Set<socketId>`. La vista pública (`room:users`) se agrupa por `guestUserId`: un
mismo invitado con varias pestañas aparece una sola vez, y solo desaparece cuando su último
socket sale de la sala. `PublicUser.id` pasa a representar el `guestUserId` (antes era el
`socket.id`, ver ADR-004) porque una entrada de la lista puede representar más de un socket.

**Slug generado exclusivamente en el backend, sin sufijos automáticos.** Ante colisión, la
restricción única de `Room.slug` en PostgreSQL es la autoridad final: se responde
`409 ROOM_SLUG_CONFLICT` en vez de generar `nombre-2`, `nombre-3`, etc. Slugs reservados
(`api`, `health`, `ready`, `admin`, `socket.io`, `general`) se validan antes de tocar la DB.

**Historial por REST, tiempo real por Socket.IO** (mismo patrón de ADR-004), ahora parametrizado
por sala: `GET /api/rooms/:slug/messages` ya soportaba esto sin cambios, porque el modelo de
datos (`Message.roomId` obligatorio, índice `roomId+createdAt`) nunca asumió una sola sala.

**`message:send` no confía en un `roomId` del cliente.** El servidor determina la sala efectiva
desde el estado de presencia del socket (`RoomPresenceState.getOwnPresence`), nunca desde el
payload — un socket físicamente no puede escribir en una sala a la que no se unió por
`room:join`.

**Lista de salas solo por REST, sin `room:created`.** Se refresca al montar, tras crear una
sala, tras reconectar, y al recuperar el foco de la ventana. Sin polling.

**Reemplazo completo del contrato de la Fase 2/3**: `user:join`/`user:joined`/`user:left`/
`user:list` se eliminaron; `room:join` ahora resuelve identidad invitada **y** sala en un solo
evento (ya no hay un paso de "identidad" separado de "sala"). Sin alias de compatibilidad,
porque el contrato anterior nunca se publicó a producción.

## Bug encontrado y corregido durante la implementación

`localStorage` es compartido por **origen**, no por pestaña. El diseño inicial releía
`getStoredGuestUserId()`/`getStoredActiveRoomSlug()` en cada cambio de sala y en cada
reconexión. Si dos pestañas del mismo navegador tenían sesiones de invitado distintas, la
última en escribir corrompía la identidad/sala de la otra en su próxima acción. Se corrigió
guardando la identidad y la sala activa **ya resueltas para la sesión actual** en refs de
React, usadas con prioridad sobre releer `localStorage` — que solo se consulta en el primer
`join()` de una pestaña nueva. Cubierto con pruebas de regresión en `useChatSocket.test.ts`.

## Limitaciones

- Presencia sigue sin persistir (ver ADR-003/ADR-004): un reinicio de la API pierde quién está
  conectado, no los mensajes.
- Sin eliminación ni edición de salas, sin salas privadas, sin roles, sin membresías.
- `RoomPresenceState` es un `Map` en memoria de un solo proceso — no escala a múltiples
  instancias de `apps/api` sin un adaptador compartido (ej. Redis adapter de Socket.IO), fuera
  de alcance de esta fase.

## Consecuencias

Si en el futuro se necesita escalar `apps/api` horizontalmente (Kubernetes con réplicas), la
presencia y el broadcast por sala (`io.to(roomId)`) requerirían el adaptador Redis de
Socket.IO para seguir siendo consistentes entre instancias.
