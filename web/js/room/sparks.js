/**
 * Today's sparks: three ideas to start from, different every day and in the spirit of the room you are in, so an
 * empty desk always has somewhere to begin. A room invented on the device brings its own, the things the maker pictured
 * as it read your words; any other room borrows the sparks of the built-in room it most resembles.
 */
const SPARKS = {
  atelier: ['A lighthouse inside a teacup, at dusk', 'The view from my window, as a watercolour', 'A still life of lemons and a blue jug, morning light', 'An old bicycle against a sunlit wall', 'A map of an imaginary island, inked by hand', 'Paper boats on a rainy pavement'],
  princess: ['A tea party for the moon, roses everywhere', 'A ribboned letter sealed with a heart of wax', 'A music box ballerina in a snow globe', 'A pastel carriage made of macarons', 'A garden of roses at golden hour, soft as a dream', 'A vanity table with pearls, perfume and a love note'],
  arcade: ['A neon koi pond in a rainy alley', 'A pixel-art city at 2am, one window still lit', 'A cat piloting a tiny spaceship', 'An arcade cabinet glowing in a forest', 'Synthwave sunset over a sea of chrome', 'A vending machine that sells the stars'],
  noir: ['A rain-soaked phone booth at 3am', 'Smoke curling under a single desk lamp', 'A trench coat on a hook, rain on the glass', 'A late train pulling into an empty station', 'Venetian blinds slicing the city light', 'A jazz club seen from the street, through fog'],
  greenhouse: ['Morning mist over a terracotta garden', 'A fern unfurling, seen very close', 'A greenhouse in the rain, lamps on inside', 'A tea tray among the tomato vines', 'Moss growing over an old stone stair', 'Seed packets and muddy gloves on a bench'],
  riviera: ['A striped awning over a lemon stall', 'A cobalt sea seen through white shutters', 'A vintage scooter on a cliff road', 'Ice cream melting on a hot terrace', 'Sailboats like folded paper in the bay', 'A swimming pool painted by Hockney’s cousin'],
  observatory: ['A brass telescope pointed at a comet', 'Constellations drawn on midnight-blue paper', 'A library under a glass dome full of stars', 'A moth the size of the moon', 'An astronomer’s desk at dawn, maps everywhere', 'The northern lights over a sleeping village'],
};
const BY_TYPE = { editorial: 'atelier', romance: 'princess', pixel: 'arcade', typewriter: 'noir', modern: 'greenhouse', grotesk: 'riviera', classical: 'observatory' };

/** Three sparks for this room, today. */
export function sparksFor(room, date = new Date()) {
  const pool = room?.sparks?.length >= 3 ? room.sparks : SPARKS[room?.id] || SPARKS[BY_TYPE[room?.type]] || SPARKS.atelier;
  const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
  return [0, 1, 2].map(i => pool[(day * 2 + i) % pool.length]);
}
