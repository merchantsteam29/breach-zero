// The three handmade floors of Ardent Biolabs, Site Zero.
//
// Map legend (one character = one 3 m cell):
//   #  wall              .  floor            P  player start      X  lift (exit)
//   d  door              1  BLUE door        2  RED door          3  YELLOW door
//   b r y  keycards      a  pistol ammo      s  shotgun shells    h  medkit
//   g  shotgun           n  audio log        V  power switch      *  finale spawn point
//   c  crate (jumpable)  t  lab table        o  cryo tube         ~  blood on the floor
//   L  ceiling lamp      E  red emergency    k  broken (flickering) lamp
//   w  husk  f  crawler  B  brute  S  spitter          (lower case = awake now)
//   W  F  U  Z  the same four, dormant: they wake when a keycard or the shotgun nearby is taken

export const FLOORS = [
  {
    name: 'SUBLEVEL 3',
    sub: 'Cryogenics Wing',
    fog: 0.085,
    ambient: 0x1a2430,
    steps: [
      { need: 'b', text: 'Find a BLUE keycard' },
      { need: 'exit', text: 'Get to the service lift' },
    ],
    map: [
      '##############################',
      '#o.o.o#.......#......#.......#',
      '#..L..d...k...d..E...#..n.L..#',
      '#o.P.o#.......#......d.......#',
      '#.....#..c.c..#......#..t.t..#',
      '#o.n.o#.......#..f...#..t.t.w#',
      '###d#####d#####......#...a...#',
      '#......k......######d####d####',
      '#.~....w......d..............#',
      '####d######d###.....W........#',
      '#......#......#..L.....L.....#',
      '#..L...#.f....#....t.t..W..h.#',
      '#.a....#...k..#.......b......#',
      '#......#......#####1#######d##',
      '#..h...#.~..n.#....E...#...a.#',
      '#......#......#........#.....#',
      '##################X###########',
    ],
    notes: [
      { from: 'Dr. Mara Okafor — Cryo log 114', text: 'Subjects in pods four through nine are showing activity during deep sleep. Heart rates of zero, but the pods keep logging movement. I told Vance. Vance told me to stop logging movement.' },
      { from: 'Technician R. Hale — personal', text: 'If anyone finds this: the lift codes were wiped when the lockdown hit. Security keeps spare cards on every floor. Blue for the wings, red for the lift bays, yellow for reactor control. Do not go into the dark ones.' },
      { from: 'Dr. Mara Okafor — Cryo log 117', text: 'Pod six is empty. The glass is not broken. It was opened from the inside, and it was not opened by a person. We are calling the compound BLOOM in the reports now. It does not kill the host. That is the problem.' },
    ],
  },
  {
    name: 'SUBLEVEL 2',
    sub: 'Biohazard Research',
    fog: 0.08,
    ambient: 0x22261c,
    steps: [
      { need: 'b', text: 'Find the BLUE keycard (south labs)' },
      { need: 'r', text: 'Find the RED keycard behind the blue door' },
      { need: 'exit', text: 'Unlock the RED lift bay and go up' },
    ],
    map: [
      '################################',
      '#......#.........#.......n.....#',
      '#..P...d....L....#.....E.......#',
      '#..L...#..t...t..#..o.o.o.o....#',
      '#......#..t.n.t..#.............#',
      '###d####..t...t..#..o.o.o.o..S.#',
      '#......#..a.w....#......Z...r..#',
      '#.k....#####d###########1#######',
      '#..~...........................#',
      '#..f...........L.....w...~.....#',
      '###d######d##########d######2###',
      '#......#......#...g.......#....#',
      '#.L..h.#..L...#..c.....c..#..L.#',
      '#......#...f..#.....L.....#....#',
      '#..w...d......#....B......#.s..#',
      '#......#.s....#..c.....c..#....#',
      '#.n..a.#..~...#...F...F...#..h.#',
      '#......#.....s#.........b.#....#',
      '############################X###',
    ],
    notes: [
      { from: 'Security Chief D. Vance — audio log', text: 'Containment is holding on Two. I sealed the south labs with the specimen we call the Brute still inside. Whoever has the blue card: do not go in there without the shotgun from the armory crate. It took nine rounds to slow it down.' },
      { from: 'Dr. Ines Ward — lab notes', text: 'The spitters are not a separate strain. They are what BLOOM does to people who were already sick. The acid sac grows from the lungs. It can reach you from across a room. Keep moving and keep cover between you.' },
      { from: 'Dr. Mara Okafor — final log', text: 'The board approved surface evacuation for staff only. Specimens and infected personnel stay below. I watched them weld the B1 lift shut. The only way out now is the reactor-powered freight lift. Somebody has to turn the power back on.' },
    ],
  },
  {
    name: 'SUBLEVEL 1',
    sub: 'Reactor & Surface Access',
    fog: 0.075,
    ambient: 0x2a1c1c,
    steps: [
      { need: 'b', text: 'Find the BLUE keycard (storage, south-east)' },
      { need: 'y', text: 'Get the YELLOW keycard from the Security office' },
      { need: 'power', text: 'Restore power in Reactor Control' },
      { need: 'survive', text: 'SURVIVE until the freight lift arrives' },
      { need: 'exit', text: 'GET TO THE FREIGHT LIFT' },
    ],
    map: [
      '##################################',
      '#.....#...........#......#.......#',
      '#..P..d.....L.....d..E...#...n...#',
      '#.....#..c.....c..#......#.......#',
      '#..L..#....w......#..f...1....y..#',
      '#.....#..c.....c..#......#..S....#',
      '###d#######d#######d##############',
      '#*.....L..........w.......k.....*#',
      '#.....~......f.........L.........#',
      '####d#####d#########3########d####',
      '#..............#.........#.......#',
      '#.*..L.....*...#..o...o..#..s..a.#',
      '#...#.....#....#....E....#.......#',
      '#..............#..t...t..#..F.F..#',
      '#......~.......#....V....#...b...#',
      '#..............#..B...S..#..h....#',
      '#...#.....#....#.........#.n..f..#',
      '#.L........L...#..o...o..#.......#',
      '#.*....h....*..#....n....#..s.a..#',
      '#..............#.........#.......#',
      '#######X##########################',
    ],
    notes: [
      { from: 'Security office — shift board', text: 'Reactor Control is yellow-card only. Freight lift draws from the reactor bus: once power is restored it takes about a minute to come down from the surface. Expect everything on this level to hear the alarm.' },
      { from: 'Unknown — scratched recording', text: 'They follow sound. Gunshots most of all. Sprinting is loud. Your light is louder than you think. When it goes dark, stand still and let it charge. They cannot see you in the dark as well as you think they can. Or maybe they can.' },
      { from: 'Dr. Mara Okafor — unsent', text: 'If you are hearing this, you are the last one still yourself. The surface team will not wait. Pull the breaker, get to the freight lift, and do not let anything ride up with you.' },
    ],
  },
];

export const DIFFICULTY = {
  easy: { label: 'Easy', dmg: 0.55, hp: 0.8, speed: 0.9, ammo: 1.6, sight: 0.8, waves: 0.7 },
  normal: { label: 'Normal', dmg: 1, hp: 1, speed: 1, ammo: 1, sight: 1, waves: 1 },
  nightmare: { label: 'Nightmare', dmg: 1.6, hp: 1.25, speed: 1.12, ammo: 0.7, sight: 1.3, waves: 1.35 },
};
