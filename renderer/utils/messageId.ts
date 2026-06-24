// Date-only React keys collide in same-tick message appends; HMR can reset counters.
let counter = Math.floor(Math.random() * 1_000_000);

export const genMessageId = (): string => `${Date.now()}-${++counter}`;
