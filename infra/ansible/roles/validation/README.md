# Rol `validation`

## Responsabilidad

A diferencia de los demás roles de este checkpoint, `validation` **ya es
funcional y definitivo** — no es un esqueleto para una fase futura. Su
trabajo es confirmar, de forma repetible y no destructiva, que el nodo
cumple los requisitos documentados para llegar a instalar RKE2 (fases
futuras) y que RKE2/Kubernetes siguen ausentes mientras corresponda.

## Qué valida

| Chequeo | Tipo | Bloqueante si falla |
|---|---|---|
| Distribución (Ubuntu) | `assert` | Sí |
| Arquitectura (x86_64) | `assert` | Sí |
| `systemd` como gestor de servicios | `assert` | Sí |
| Python 3 remoto | `assert` | Sí |
| CPU — mínimo (`validation_min_cpu_cores` = 2) | `assert` | Sí |
| CPU — recomendado (`validation_recommended_cpu_cores` = 4) | advertencia | No |
| RAM — mínimo (`validation_min_ram_mb` = 3800 MB) | `assert` | Sí |
| RAM — recomendado (`validation_recommended_ram_mb` = 8192 MB / 8 GiB) | advertencia | **No** |
| Espacio libre en disco (`/`) | `assert` | Sí |
| Hostname no vacío | `assert` | Sí |
| Sincronización horaria (NTP) | lectura, reportada | No |
| Resolución DNS de salida | lectura, reportada | No |
| Estado de AppArmor | lectura, reportada | No |
| `sudo` disponible sin contraseña | lectura, reportada | No |
| RKE2 ausente/presente | lectura, reportada | No |
| Kubernetes (`kubeconfig`) ausente/presente | lectura, reportada | No |

## Por qué RAM y CPU distinguen "mínimo" de "recomendado"

RKE2 documenta un mínimo oficial, pero este proyecto además define una
**recomendación propia** (8 GiB de RAM, 4 núcleos) porque el nodo va a
correr, además del control plane y `etcd`, los propios workloads de la
aplicación (API, frontend, PostgreSQL). El estado actual conocido de
`devops-lab` (~5.8 GiB de RAM) **cumple el mínimo mas no la
recomendación** — el rol lo clasifica exactamente así y **no falla el
playbook por eso**, solo emite una advertencia clara. Fallar por no
cumplir una recomendación (en vez de un mínimo real) convertiría cualquier
ejecución en un bloqueo innecesario para una decisión que todavía está
pendiente de aprobación (aumentar la RAM de la VM, ver Fase 7.2C).

## Variables

| Variable | Default | Significado |
|---|---|---|
| `validation_min_cpu_cores` | `2` | Mínimo documentado por RKE2 |
| `validation_recommended_cpu_cores` | `4` | Recomendación de este proyecto |
| `validation_min_ram_mb` | `3800` | Mínimo documentado por RKE2 (4 GB, con margen de redondeo) |
| `validation_recommended_ram_mb` | `8192` | Recomendación de este proyecto (8 GiB) |
| `validation_min_disk_free_gb` | `20` | Mínimo razonable para imágenes/logs/`etcd` |
| `validation_supported_distribution` | `"Ubuntu"` | Única distribución soportada (ver ADR-008) |

## Por qué no usa `shell` cuando existen módulos apropiados

Todos los chequeos que tienen un `ansible_facts` equivalente
(distribución, arquitectura, CPU, RAM, hostname, gestor de servicios,
versión de Python) usan `ansible.builtin.assert` sobre esos facts, no
`shell`/`command`. Solo se usa `ansible.builtin.command` (nunca `shell`,
que además invoca un intérprete de shell innecesario) para lo que no tiene
un módulo dedicado ni un fact directo: `timedatectl`, `getent hosts`,
`systemctl is-active apparmor`, `sudo -n -v`, y siempre con
`changed_when: false` explícito porque son lecturas puras.

## Idempotencia

Todo el rol es de solo lectura — correrlo cien veces produce exactamente
el mismo resultado, `changed=0` siempre.

## Riesgos

Ninguno directo (no modifica nada). El único riesgo indirecto es un falso
negativo: que un chequeo pase por error cuando el requisito real no se
cumple. Por eso los umbrales (`validation_min_*`) están tomados
directamente de la documentación oficial de RKE2 y del runbook de
auditoría ya validado de la Fase 7.0, no inventados.

## Reversión

No aplica — este rol nunca modifica el sistema, en ningún checkpoint
futuro tampoco (su responsabilidad es exclusivamente verificar, no
cambiar).

## Relación con RKE2/Kubernetes

Es el rol que `validate-rke2.yml` invoca para confirmar, antes y después
de instalar RKE2 (en fases futuras), que el nodo sigue cumpliendo los
requisitos y que el estado de RKE2/Kubernetes es el esperado en cada
momento — ausente hoy, presente y `Ready` una vez que la Fase 7.3 lo
instale.
