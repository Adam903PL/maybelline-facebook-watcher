// Timestamped console logging — Docker's own `logs -t` timestamps are UTC and
// easy to forget to enable; stamping here makes every line self-dating.
function stamp() {
  return new Date().toISOString();
}

export const log = (...args) => console.log(stamp(), ...args);
export const warn = (...args) => console.warn(stamp(), ...args);
export const error = (...args) => console.error(stamp(), ...args);
