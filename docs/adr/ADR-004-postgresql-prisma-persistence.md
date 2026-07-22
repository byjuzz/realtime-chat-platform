# ADR-004: Persistencia con PostgreSQL y Prisma

## Estado

Aceptado

## Contexto

El MVP de la Fase 2 (ver [ADR-003](ADR-003-in-memory-state-mvp.md)) guardaba usuarios y mensajes
únicamente en memoria del proceso de `apps/api`, perdiéndolos en cada reinicio. La Fase 3
agrega persistencia real para que la sala general conserve historial, y para que un usuario
invitado conserve una identidad básica entre visitas.

## Decisiones

### Por qué PostgreSQL

Motor relacional maduro, con soporte nativo de tipos (`uuid`, `timestamp`), índices compuestos
eficientes para el patrón de acceso del historial (`roomId + createdAt`), y es el motor que
eventualmente correrá en el clúster RKE2 de despliegue — desarrollar contra el mismo motor desde
el principio evita sorpresas de compatibilidad más adelante.

### Por qué Prisma

ORM tipado que genera un cliente TypeScript a partir de `schema.prisma`, con migraciones
versionadas y una CLI madura (`migrate`, `generate`, `studio`, seeding). Reduce el código
repetitivo de acceso a datos manteniendo tipos correctos de punta a punta.

### Persistencia frente a estado en memoria

- **Mensajes y salas**: ahora persistidos en PostgreSQL. Sobreviven a reinicios de `apps/api`.
- **Presencia (quién está conectado ahora mismo)**: **sigue en memoria** (`RoomState`), a
  propósito. No se persiste `socket.id` ni el estado online/offline — la presencia es efímera
  por naturaleza (un socket desconectado no tiene sentido "recordarlo" como conectado), y
  persistirla agregaría complejidad (limpieza de conexiones huérfanas, TTLs) sin beneficio real
  para este MVP.

### Identidad invitada sin autenticación

Se introduce `GuestUser`, una identidad persistente desacoplada de `socket.id`:

- `PublicUser.id` sigue siendo `socket.id` — identidad de **presencia**, cambia en cada conexión.
- `PublicUser.guestUserId` es el `GuestUser.id` — identidad **persistente**, se guarda en
  `localStorage` del navegador y se reutiliza en conexiones futuras.
- **No es autenticación real**: no hay contraseña, no hay JWT, no hay verificación de que quien
  presenta un `guestUserId` sea realmente su "dueño" original. Cualquiera puede borrar
  `localStorage` o falsificar el valor manualmente. Es identidad de conveniencia para que los
  mensajes de una misma persona se vean consistentes entre recargas, nada más.
- Nombres visibles (`displayName`) duplicados están permitidos, igual que en la Fase 2.
- Si un `guestUserId` enviado por el cliente no existe en la base (localStorage manipulado, base
  reseteada, etc.), la API crea uno nuevo silenciosamente — no se trata como error de seguridad,
  porque no lo es.

### Historial por REST, tiempo real por Socket.IO

`GET /api/rooms/:roomSlug/messages` (paginado por cursor `createdAt + id`) resuelve la carga
inicial y la carga de mensajes anteriores. Socket.IO sigue siendo el canal exclusivo para
mensajes nuevos en tiempo real. El frontend deduplica por `id` al combinar ambas fuentes.

### Regla dura: no hay broadcast optimista

Un mensaje solo se emite por `message:new` **después** de confirmarse su escritura en
PostgreSQL. Si la escritura falla, se responde un ack de error tipado
(`MESSAGE_PERSISTENCE_FAILED`) y no se emite nada — nunca se le muestra al resto de la sala un
mensaje que en realidad no se guardó.

## Limitaciones de esta fase

- Sin autenticación real ni protección de la identidad invitada.
- Una sola sala (`general`); el modelo soporta múltiples salas pero no hay UI para crearlas.
- Sin caché, sin límite de conexiones configurado explícitamente en Prisma más allá del default.
- El desarrollo local depende de una instancia de PostgreSQL corriendo en la máquina (sin Docker
  en esta fase); ver README para el procedimiento de instalación local.
- La base de datos local no tiene backups — es un entorno de laboratorio.

## Consecuencias y futuras mejoras

- Cuando se agregue autenticación real, `GuestUser` probablemente se reemplace o se vincule a un
  modelo `User` con credenciales; los mensajes existentes (`authorId`) deberían poder migrarse.
- Si el proyecto necesita múltiples instancias de `apps/api` (por ejemplo, en Kubernetes con
  varias réplicas), la presencia en memoria (`RoomState`) dejaría de ser consistente entre
  instancias — requeriría moverse a un store compartido (Redis u otro) en una fase posterior.
- Docker/Kubernetes para PostgreSQL en producción quedan fuera de esta fase, documentado también
  en el roadmap general del proyecto.
