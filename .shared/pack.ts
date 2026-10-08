/** How an installed entrypoint of this pack is addressed: `owner/plugin:entrypoint`. */
export const PACK = 'seanrobertwright/lril-sdlc';

export function entry(name: string): string {
  return `${PACK}:${name}`;
}
