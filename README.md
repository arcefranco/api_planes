# API PLANES

API REST de sólo lectura para consultar las solicitudes de planes de ahorro en todos sus estados: precargada, pendiente de scoring, scoring OK y rechazada.

Todas las respuestas son JSON en UTF-8 (`Content-Type: application/json; charset=utf-8`).

## Índice

- [Autorización](#autorización)
- [GET /v1/planes](#get-v1planes)
  - [Parámetros](#parámetros)
  - [Respuesta](#respuesta)
  - [Paginado](#paginado)
  - [Errores](#errores)

---

## Autorización

Todas las operaciones requieren un **token**. Para obtenerlo:

### 1. Solicitar un usuario

Los usuarios los crea el administrador de la API. Pedí el alta indicando tu nombre y email; vas a recibir un email y una contraseña.

### 2. Obtener el token

```
POST /getToken
```

```json
{
  "email": "usuario@empresa.com",
  "password": "tu_contraseña"
}
```

Respuesta:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h"
}
```

El token **vence a las 24 horas**. Cuando vence, se vuelve a pedir de la misma forma.

### 3. Usar el token en cada operación

Enviá el token en el header `Authorization` de **cada** pedido, con el prefijo `Bearer`:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Errores de autorización

| Código | Motivo |
|---|---|
| 400 | Faltan `email` o `password` al pedir el token |
| 401 | Email o contraseña incorrectos |
| 401 | No se envió el token, o el header no tiene el formato `Bearer <token>` |
| 401 | Token inválido o expirado (pedir uno nuevo) |
| 401 | El usuario del token fue dado de baja |

---

## GET /v1/planes

Devuelve las solicitudes de plan de ahorro. **Sin parámetros, devuelve todas** (de a páginas, ver [Paginado](#paginado)).

```
GET /v1/planes?fecha_desde=2026-10-01&fecha_hasta=2026-10-31
Authorization: Bearer <token>
```

### Parámetros

Todos son opcionales y van en la URL (query string). Si se pasan varios, se combinan con **Y**.

| Parámetro | Tipo | Qué filtra |
|---|---|---|
| `fecha_desde`, `fecha_hasta` | `AAAA-MM-DD` | Fecha de alta, ambos días inclusive |
| `scoring_desde`, `scoring_hasta` | `AAAA-MM-DD` | Fecha de scoring, ambos días inclusive. Sólo devuelve solicitudes en estado `scoring_ok` |
| `estado` | texto | Uno de: `precargada`, `pendiente_scoring`, `scoring_ok`, `rechazada` |
| `limite` | entero | Registros por página. Por defecto 200, máximo 500 |
| `cursor` | texto | El `siguiente_cursor` de la página anterior |

Un parámetro desconocido o mal escrito (por ejemplo `fecha_desdee`) **no se ignora**: devuelve error 400.

Ejemplos:

```
# Solicitudes dadas de alta en octubre
GET /v1/planes?fecha_desde=2026-10-01&fecha_hasta=2026-10-31

# Solicitudes con scoring OK en octubre (aunque se hayan dado de alta antes)
GET /v1/planes?scoring_desde=2026-10-01&scoring_hasta=2026-10-31

# Sólo las rechazadas
GET /v1/planes?estado=rechazada
```

### Respuesta

```json
{
  "datos": [
    {
      "numero_solicitud": "3925",
      "fecha_alta": "2026-09-28",
      "vendedor": "Diego Ezequiel Orellana",
      "cuota1_cobrada": 412500,
      "es_sena": false,
      "debito_automatico": true,
      "estado": "scoring_ok",
      "fecha_scoring": "2026-10-03",
      "cliente_nombre": "Juan Pérez"
    }
  ],
  "siguiente_cursor": null,
  "generado_en": "2026-10-13T18:45:00-03:00"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `numero_solicitud` | texto | Número de solicitud |
| `fecha_alta` | `AAAA-MM-DD` | Día de alta de la solicitud |
| `vendedor` | texto | Nombre del vendedor |
| `cuota1_cobrada` | número | Importe cobrado de la cuota 1. `0` si no se cobró nada |
| `es_sena` | booleano | `true` si lo cobrado es una seña y no la cuota 1 completa |
| `debito_automatico` | booleano | `true` si el cliente adhirió al débito automático |
| `estado` | texto | `precargada`, `pendiente_scoring`, `scoring_ok` o `rechazada` |
| `fecha_scoring` | `AAAA-MM-DD` o `null` | Día del scoring OK. Sólo viene cuando `estado` es `scoring_ok` |
| `cliente_nombre` | texto | Nombre del cliente o razón social |

Además de `datos`, la respuesta trae `siguiente_cursor` (ver abajo) y `generado_en`, la fecha y hora de la consulta en hora de Argentina.

### Paginado

Los resultados vienen ordenados por `numero_solicitud` ascendente y de a `limite` registros por página.

- Si `siguiente_cursor` es `null`, no hay más páginas.
- Si trae un valor, hay más: repetí la **misma consulta, con los mismos filtros**, agregando `cursor=<ese valor>`.

El cursor es un texto opaco: no hay que interpretarlo ni armarlo a mano, sólo devolverlo tal cual.

```
GET /v1/planes?fecha_desde=2026-01-01&limite=2
→ "siguiente_cursor": "eyJucyI6MzkyNn0"

GET /v1/planes?fecha_desde=2026-01-01&limite=2&cursor=eyJucyI6MzkyNn0
→ trae la página siguiente, y así hasta que siguiente_cursor sea null
```

Ejemplo para traer todas las páginas (JavaScript):

```js
let todos = [];
let cursor = null;

do {
  const params = new URLSearchParams({ fecha_desde: "2026-01-01", limite: "500" });
  if (cursor) params.set("cursor", cursor);

  const r = await fetch(`https://<host>/v1/planes?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json();

  todos.push(...body.datos);
  cursor = body.siguiente_cursor;
} while (cursor);
```

### Errores

Los errores de este endpoint devuelven el código HTTP correspondiente y este cuerpo:

```json
{ "error": { "codigo": "parametro_invalido", "mensaje": "fecha_desde no es una fecha AAAA-MM-DD" } }
```

| Código HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `parametro_desconocido` | Se envió un parámetro que no existe o está mal escrito |
| 400 | `parametro_invalido` | Fecha que no es `AAAA-MM-DD`, `estado` desconocido, `limite` fuera de 1–500, `cursor` inválido o parámetro repetido |
| 401 | — | Falta el token, o es inválido o expiró (ver [Errores de autorización](#errores-de-autorización)) |
| 500 | `error_interno` | Error interno |
| 503 | `servicio_no_disponible` | No se pudo conectar con la base de datos. Reintentar en unos minutos |
