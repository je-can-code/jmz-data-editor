declare global
{
  interface StringConstructor
  {
    empty: "";
  }
}

/**
 * Extends the global javascript {@link String} object.
 * Adds a new property: {@link String.empty}, which is just an empty string.
 *
 * This is used to more clearly show developer intent rather than just arbitrarily
 * adding empty double quotes all over the place.
 * @type {string}
 */
Object.defineProperty(String, "empty", {
  value: "",
  writable: false
});

export {}