# PA API

API para consultar operaciones (por teléfono, documento o grupo y orden) y cargar observaciones sobre ellas, en las bases de datos de cada empresa del grupo.

Todos los pedidos y respuestas son JSON (`Content-Type: application/json`).

## Índice

- [Autorización](#autorización)
- [Operaciones](#operaciones)
  - [POST /getOpByTel](#post-getopbytel)
  - [POST /getOperacion](#post-getoperacion)
  - [POST /postObs](#post-postobs)
- [Códigos de empresas](#códigos-de-empresas)
- [Códigos de marcas](#códigos-de-marcas)

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

## Operaciones

### POST /getOpByTel

Busca las operaciones de una empresa asociadas a un número de teléfono. El número se busca en los cuatro campos de teléfono de la operación.

El teléfono se puede enviar en cualquier formato (con o sin guiones, espacios, paréntesis o código de área): la búsqueda compara los **últimos 8 dígitos**. Si un campo tiene varios números guardados (por ejemplo `1555-079889 / 4603-1722`), se compara contra cada uno. El número enviado debe tener al menos 8 dígitos.

**Body**

| Campo | Tipo | Descripción |
|---|---|---|
| `empresa` | número | Código de la empresa (ver [Códigos de empresas](#códigos-de-empresas)) |
| `nro_tel` | texto | Número de teléfono a buscar |

```json
{
  "empresa": 8,
  "nro_tel": "1155555555"
}
```

**Respuesta**: lista de operaciones encontradas (vacía si no hay coincidencias).

```json
[
  { "NroDocumento": "30111222", "Grupo": 1234, "Orden": 56 }
]
```

### POST /getOperacion

Devuelve las operaciones de una empresa con sus teléfonos. Se busca **por número de documento**, **por grupo y orden**, o **por los tres a la vez**.

**Body**

| Campo | Tipo | Descripción |
|---|---|---|
| `empresa` | número | Obligatorio. Código de la empresa (ver [Códigos de empresas](#códigos-de-empresas)) |
| `nro_documento` | número | Número de documento del titular. Puede devolver varias operaciones |
| `grupo` | número | Grupo de la operación. Se envía siempre junto con `orden` |
| `orden` | número | Orden de la operación. Se envía siempre junto con `grupo` |

Buscar por documento:

```json
{
  "empresa": 8,
  "nro_documento": "30111222"
}
```

Buscar por grupo y orden:

```json
{
  "empresa": 8,
  "grupo": 1234,
  "orden": 56
}
```

Buscar por los tres:

```json
{
  "empresa": 8,
  "nro_documento": 30111222,
  "grupo": 1234,
  "orden": 56
}
```

**Respuesta**: lista de operaciones encontradas (vacía si no hay coincidencias).

```json
[
  {
    "NroDocumento": "30111222",
    "Grupo": 1234,
    "Orden": 56,
    "Telefonos": "(011)4265-3305",
    "Telefonos2": "1520502258",
    "Telefonos3": null,
    "Telefonos4": null
  }
]
```

### POST /postObs

Carga una observación sobre una operación, identificada por su grupo y orden.

**Body**

| Campo | Tipo | Descripción |
|---|---|---|
| `empresa` | número | Código de la empresa (ver [Códigos de empresas](#códigos-de-empresas)) |
| `grupo` | número | Grupo de la operación |
| `orden` | número | Orden de la operación |
| `observacion` | texto | Texto de la observación |
| `usuario` | texto | nombre de usuario que carga la observación |
| `marca` | número | Código de la marca (ver [Códigos de marcas](#códigos-de-marcas)) |

```json
{
  "empresa": 8,
  "grupo": 1234,
  "orden": 56,
  "observacion": "El cliente solicita que lo llamen por la tarde",
  "usuario": "jperez",
  "marca": 2
}
```

**Respuesta**

```json
{ "message": "Observación cargada exitosamente" }
```

### Errores de las operaciones

| Código | Motivo |
|---|---|
| 400 | Faltan parámetros obligatorios |
| 400 | `nro_tel` tiene menos de 8 dígitos (`/getOpByTel`) |
| 400 | Se envió solo `grupo` o solo `orden` (`/getOperacion`) |
| 404 | El código de empresa no existe |
| 404 | No se encontró una operación con ese grupo y orden (`/postObs`) |
| 500 | Error interno o de base de datos |

---

## Códigos de empresas

| Código | Empresa |
|---|---|
| 1 | GESTIÓN FINANCIERA |
| 3 | AUTONET |
| 6 | AUTOCERVO |
| 7 | AUTOS DEL PLATA |
| 8 | CAR GROUP |
| 9 | DETROIT |
| 14 | ALIZZE |
| 15 | ELYSEES |
| 16 | GIAMA RENTING |
| 18 | OHIO |
| 21 | ALIZZE LM |

## Códigos de marcas

| Código | Marca | Empresas que la comercializan |
|---|---|---|
| 1 | CHEVROLET | GESTIÓN FINANCIERA (1) |
| 2 | FIAT | CAR GROUP (8), AUTONET (3), AUTOCERVO (6) |
| 5 | VOLKSWAGEN | AUTOCERVO (6) |
| 6 | CHERY | AUTOS DEL PLATA (7) |
| 7 | JEEP | DETROIT (9), OHIO (18) |
| 8 | DFSK | AUTOS DEL PLATA (7) |
| 11 | PEUGEOT | ALIZZE (14) |
| 12 | CITROEN | ELYSEES (15) |
| 13 | Giama Renting | GIAMA RENTING (16) |
| 14 | PEUGEOT LEAPMOTOR | ALIZZE LM (21) |
