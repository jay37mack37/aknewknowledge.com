export const MAZE_WIDTH = 28;
export const MAZE_HEIGHT = 31;

export const TILE_EMPTY = 0;
export const TILE_WALL = 1;
export const TILE_PELLET = 2;
export const TILE_POWER_PELLET = 3;
export const TILE_GHOST_HOUSE = 4;
export const TILE_GHOST_DOOR = 5;

export const CLASSIC_MAZE_LAYOUT = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###==### ##.#     ",
  "######.## #  --  # ##.######",
  "      .   #  --  #   .      ",
  "######.## #  --  # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################"
];

export function createMaze(layout = CLASSIC_MAZE_LAYOUT) {
  const height = layout.length;
  const width = layout[0].length;
  const tiles = [];
  let pelletsCount = 0;

  for (let y = 0; y < height; y++) {
    const row = [];
    const line = layout[y];
    for (let x = 0; x < width; x++) {
      const char = line[x];
      let tile = TILE_EMPTY;
      if (char === '#') {
        tile = TILE_WALL;
      } else if (char === '.') {
        tile = TILE_PELLET;
        pelletsCount++;
      } else if (char === 'o') {
        tile = TILE_POWER_PELLET;
        pelletsCount++;
      } else if (char === '=') {
        tile = TILE_GHOST_DOOR;
      } else if (char === '-') {
        tile = TILE_GHOST_HOUSE;
      } else {
        tile = TILE_EMPTY;
      }
      row.push(tile);
    }
    tiles.push(row);
  }

  const maze = {
    width,
    height,
    tiles,
    initialPelletCount: pelletsCount,
    pelletsRemaining: pelletsCount,
    spawns: {
      pacman: { x: 13.5, y: 23 },
      blinky: { x: 13.5, y: 11 },
      pinky: { x: 13.5, y: 14 },
      inky: { x: 11.5, y: 14 },
      clyde: { x: 15.5, y: 14 }
    },
    ghostDoor: { x: 13.5, y: 12 },
    scatterTargets: {
      blinky: { x: 25, y: 0 },
      pinky: { x: 2, y: 0 },
      inky: { x: 27, y: 30 },
      clyde: { x: 0, y: 30 }
    },

    getTile(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (iy === 14) {
        // Tunnel row horizontal wrap
        const wrappedX = ((ix % width) + width) % width;
        return tiles[iy][wrappedX];
      }
      if (iy < 0 || iy >= height || ix < 0 || ix >= width) {
        return TILE_WALL;
      }
      return tiles[iy][ix];
    },

    setTile(x, y, tile) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (iy >= 0 && iy < height && ix >= 0 && ix < width) {
        tiles[iy][ix] = tile;
      }
    },

    wrapX(x, y) {
      const iy = Math.floor(y);
      if (iy === 14) {
        return ((x % width) + width) % width;
      }
      return x;
    },

    isWall(x, y) {
      const t = this.getTile(x, y);
      return t === TILE_WALL;
    },

    isWalkable(x, y, options = {}) {
      const { isGhost = false, canPassDoor = false } = options;
      const t = this.getTile(x, y);
      if (t === TILE_WALL) return false;
      if (t === TILE_GHOST_DOOR) {
        return isGhost && canPassDoor;
      }
      if (t === TILE_GHOST_HOUSE) {
        return isGhost;
      }
      return true;
    },

    eatPellet(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (iy < 0 || iy >= height || ix < 0 || ix >= width) return null;
      const tile = tiles[iy][ix];
      if (tile === TILE_PELLET) {
        tiles[iy][ix] = TILE_EMPTY;
        this.pelletsRemaining--;
        return { eaten: true, type: 'pellet', points: 10 };
      } else if (tile === TILE_POWER_PELLET) {
        tiles[iy][ix] = TILE_EMPTY;
        this.pelletsRemaining--;
        return { eaten: true, type: 'power', points: 50 };
      }
      return null;
    }
  };

  return maze;
}
