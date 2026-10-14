// Caracteres que pueden aparecer DENTRO de un mismo número: dígitos, espacios, - . ( )
// Cualquier otro carácter (/, letras, comas, etc.) separa un número de otro.
const SEPARADOR_NUMEROS = /[^0-9\s\-.()]+/;

// Devuelve los últimos 8 dígitos de un texto, o null si tiene menos de 8
export const ultimos8 = (texto) => {
  const digitos = String(texto ?? "").replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-8) : null;
};

// Patrón REGEXP para MySQL: los 8 dígitos en orden, admitiendo - . ( ) o espacios entre ellos.
// Sirve para que la base haga un primer filtro; la coincidencia exacta se valida en coincideTelefono.
export const patronTelefono = (ult8) => ult8.split("").join("[-. ()]*");

// true si alguno de los números guardados en el campo termina en esos 8 dígitos
export const coincideTelefono = (campo, ult8) =>
  String(campo ?? "")
    .split(SEPARADOR_NUMEROS)
    .some((numero) => ultimos8(numero) === ult8);
