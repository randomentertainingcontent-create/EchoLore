/**
 * Hand-drawn pixel art for EchoLore, rendered as crisp SVG rects.
 * Each sprite is a grid of characters; each character maps to a palette colour
 * ("." is transparent). Horizontal runs are merged into single rects.
 */
import { cn } from "@/lib/utils";

const INK = {
  w: "#fff6d6", // white-hot
  y: "#ffd25e", // yellow
  o: "#ff9a3c", // orange (ember)
  r: "#e5552c", // red
  d: "#9c2f1e", // deep red
  b: "#7a4a2a", // wood
  B: "#4a2a17", // dark wood
  c: "#5fd4e8", // cyan
  m: "#e46aa8", // magenta
  g: "#3a4256", // slate
  G: "#252b39", // dark slate
  s: "#c9cfdb", // silver
  S: "#8a93a6", // steel
  p: "#efe6d2", // parchment
  P: "#c7b896", // old parchment
  k: "#141821", // ink
  l: "#7fcf6a", // leaf green
  L: "#3f8a45", // dark green
  u: "#6f8cff", // blue
  v: "#9a7bff", // violet
} as const;

type Grid = readonly string[];

function rects(grid: Grid, palette: Record<string, string>) {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) { x += 1; continue; }
      let w = 1;
      while (row[x + w] === ch) w += 1;
      out.push({ x, y, w, fill: palette[ch] });
      x += w;
    }
  });
  return out;
}

export function PixelSprite({ grid, className, title, palette = INK }: { grid: Grid; className?: string; title?: string; palette?: Record<string, string> }) {
  const width = Math.max(...grid.map((row) => row.length));
  return (
    <svg viewBox={`0 0 ${width} ${grid.length}`} className={cn("el-pixel", className)} shapeRendering="crispEdges" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {rects(grid, palette).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Campfire — two flame frames swapped with a stepped CSS animation, plus
   embers that drift upward. Logs stay still.
---------------------------------------------------------------------------- */
const FLAME_A: Grid = [
  "........r.......",
  ".......ro.......",
  ".......roo.r....",
  "......rooo.ro...",
  ".....roooyroo...",
  ".....rooyyooor..",
  "....rooyyyyoor..",
  "....rooywyyoor..",
  "....roywwwyyor..",
  ".....oywwwyyo...",
  ".....ryywwyyr...",
];
const FLAME_B: Grid = [
  ".......r........",
  ".......or.......",
  "...r..oor.......",
  "...or.ooor......",
  "...oorryooor....",
  "...rooyyoooor...",
  "....rooyyyyoor..",
  "....roooywyyor..",
  "....royywwwyor..",
  ".....oyywwwyo...",
  ".....ryywwyyr...",
];
const LOGS: Grid = [
  "...........",
  "...........",
  "...........",
  "...........",
  "...........",
  "...........",
  "...........",
  "...........",
  "...........",
  "...........",
  "...........",
  "..bbBB......BBbb.",
  "...bbbBB..BBbbb..",
  ".....BBbbbbBB....",
  "...BBbbbBBbbbBB..",
  "..bbBB......BBbb.",
];

export function PixelCampfire({ className, animated = true }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 17 16" className={cn("el-pixel el-campfire", animated && "el-campfire-live", className)} shapeRendering="crispEdges" aria-hidden="true">
      <g className="el-flame-a">{rects(FLAME_A, INK).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}</g>
      <g className="el-flame-b">{rects(FLAME_B, INK).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}</g>
      {rects(LOGS, INK).map((r, i) => <rect key={`l${i}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
      {animated && (
        <g className="el-embers">
          <rect x="6" y="2" width="1" height="1" fill={INK.y} />
          <rect x="10" y="1" width="1" height="1" fill={INK.o} />
          <rect x="8" y="0" width="1" height="1" fill={INK.w} />
        </g>
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Pixel wordmark — a tiny 5×7 bitmap font, drawn letter by letter.
---------------------------------------------------------------------------- */
const GLYPHS: Record<string, Grid> = {
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
};

export function PixelWordmark({ className }: { className?: string }) {
  const word = "ECHOLORE";
  const cells: { x: number; y: number; fill: string }[] = [];
  [...word].forEach((letter, index) => {
    const fill = index < 4 ? INK.p : INK.o;
    GLYPHS[letter].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") cells.push({ x: index * 6 + x, y, fill }); }));
  });
  return (
    <svg viewBox={`0 0 ${word.length * 6 - 1} 7`} className={cn("el-pixel", className)} shapeRendering="crispEdges" role="img" aria-label="EchoLore">
      {cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={1} height={1} fill={c.fill} />)}
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Genre sigils — 12×12 icons for the world templates.
---------------------------------------------------------------------------- */
export const SIGILS: Record<string, Grid> = {
  cyberpunk: [
    "............",
    ".......c....",
    "..m....cc...",
    "..mm...cc..c",
    "..mm.y.cc..c",
    ".cmm.y.ccc.c",
    ".cmmyyycccsc",
    ".cmmymycccsc",
    ".cmmyyycmcsc",
    ".cmmymycccsc",
    "gggggggggggg",
    "GGGGGGGGGGGG",
  ],
  dragon: [
    "..........s.",
    ".........ss.",
    "........sss.",
    ".......sss..",
    "......sss...",
    ".....sss....",
    "..y.sss.....",
    "...yss......",
    "...by.......",
    "..b..y......",
    ".b..........",
    "b...........",
  ],
  space: [
    "............",
    ".....uuu....",
    "...uuuuuuu..",
    "..uuvuuuuuu.",
    "ppuvvuuuuupp",
    ".pppuuuuppp.",
    "..uuppppuu..",
    "..uuuuuuuu..",
    "...uuuuuu...",
    ".....uu.....",
    "..........p.",
    ".p..........",
  ],
  mystery: [
    "............",
    "...ssss.....",
    "..s....s....",
    ".s.cc...s...",
    ".s.c....s...",
    ".s......s...",
    ".s......s...",
    "..s....s....",
    "...ssssbb...",
    ".......bbb..",
    "........bbb.",
    ".........bb.",
  ],
  friend: [
    "............",
    "............",
    "..mmmmmmmm..",
    "..mpmmmmmm..",
    ".uuuuuuuuu..",
    ".upuuuuuuu..",
    "..yyyyyyyyy.",
    "..ypyyyyyyy.",
    ".llllllllll.",
    ".lplllllllll",
    ".LLLLLLLLLL.",
    "............",
  ],
  horror: [
    ".....y......",
    "....yoy.....",
    "....ywy.....",
    ".....o......",
    ".....k......",
    "....ppp.....",
    "....ppp.....",
    "....pPp.p...",
    "....ppp.....",
    "....pPp.....",
    "..SSSSSSS...",
    "...SSSSS....",
  ],
  wasteland: [
    "........yy..",
    ".......yyyy.",
    "........yy..",
    ".....l......",
    "..l..l......",
    "..l..l.l....",
    "..llll.l....",
    ".....llll...",
    ".....l......",
    ".....l......",
    "PPPPPPPPPPPP",
    "bPbPPbPPbPbP",
  ],
  noir: [
    "............",
    "............",
    "....gggg....",
    "...gggggg...",
    "...gggggg...",
    "...rrrrrr...",
    ".gggggggggg.",
    "gggggggggggg",
    "............",
    "....s..s....",
    ".....s..s...",
    "....s..s....",
  ],
  pirate: [
    "............",
    "...pppppp...",
    "..pppppppp..",
    "..pkkppkkp..",
    "..pkkppkkp..",
    "..pppkkppp..",
    "...pppppp...",
    "...pkpkpp...",
    "p.........p.",
    ".pp.....pp..",
    "...ppppp....",
    ".pp.....pp..",
  ],
  academy: [
    "......yy....",
    ".....yy.....",
    "....yy......",
    "...yy.......",
    "..yyyyyy....",
    "......yy....",
    ".....yy.....",
    "....yy......",
    "...yy.......",
    "..y.........",
    "............",
    "............",
  ],
  romance: [
    "............",
    "....rrr.....",
    "...rrdrr....",
    "..rrdrrdr...",
    "..rdrrrdr...",
    "...rrdrr....",
    "....rrr.....",
    ".....L......",
    "...llL......",
    "....lL.l....",
    ".....Lll....",
    ".....L......",
  ],
  blank: [
    "..........pp",
    ".........ppP",
    "........ppP.",
    ".......ppP..",
    "......ppP...",
    ".....ppP....",
    "....ppP.....",
    "...pPP......",
    "...bP.......",
    "..b.........",
    ".k..........",
    "kkkk........",
  ],
  dice: [
    "............",
    ".pppppppppp.",
    ".pppppppppp.",
    ".ppkkppppkp.",
    ".ppkkppppkp.",
    ".pppppkpppp.",
    ".ppppkkpppp.",
    ".pkppppkkpp.",
    ".pkppppkkpp.",
    ".pppppppppp.",
    ".PPPPPPPPPP.",
    "............",
  ],
};

export function Sigil({ id, className }: { id: string; className?: string }) {
  return <PixelSprite grid={SIGILS[id] ?? SIGILS.blank} className={cn("h-9 w-9", className)} />;
}
