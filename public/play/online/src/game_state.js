import { createMaze } from './maze.js';
import { createPlayer, updateMovement, updateAngle } from './movement.js';
import {
  createGhosts,
  updateGhostAI,
  triggerFrightened,
  eatGhost,
  GHOST_MODE_CHASE,
  GHOST_MODE_SCATTER,
  GHOST_MODE_FRIGHTENED
} from './ghost_ai.js';

export const STATE_TITLE = 'TITLE';
export const STATE_PLAYING = 'PLAYING';
export const STATE_PAUSED = 'PAUSED';
export const STATE_PACMAN_DYING = 'PACMAN_DYING';
export const STATE_GHOST_EATEN_PAUSE = 'GHOST_EATEN_PAUSE';
export const STATE_LEVEL_CLEAR = 'LEVEL_CLEAR';
export const STATE_GAME_OVER = 'GAME_OVER';

export function shouldAdvanceSimulation(state) {
  return (
    state === STATE_PLAYING ||
    state === STATE_PACMAN_DYING ||
    state === STATE_GHOST_EATEN_PAUSE ||
    state === STATE_LEVEL_CLEAR
  );
}

export function createGame(options = {}) {
  const { storage = null } = options;
  let highScore = 0;
  if (storage) {
    try {
      highScore = parseInt(storage.getItem('pacman_fps_highscore') || '0', 10) || 0;
    } catch (e) {}
  }

  return {
    state: STATE_TITLE,
    score: 0,
    highScore,
    lives: 3,
    level: 1,
    storage,
    maze: null,
    player: null,
    ghosts: null,
    fruit: null,
    stateTimer: 0,
    eatenGhostPoints: null,
    pelletsEatenThisLevel: 0,
    soundEvents: []
  };
}

export function startGame(game) {
  game.score = 0;
  game.lives = 3;
  game.level = 1;
  game.pelletsEatenThisLevel = 0;
  startLevel(game, 1);
  game.state = STATE_PLAYING;
}

export function startLevel(game, levelNum) {
  game.level = levelNum;
  game.maze = createMaze();
  game.player = createPlayer(game.maze.spawns.pacman);
  game.player.speed = 5.0 + Math.min(1.5, (levelNum - 1) * 0.2);
  game.ghosts = createGhosts();
  for (const g of game.ghosts.list) {
    g.speed = 4.8 + Math.min(1.8, (levelNum - 1) * 0.25);
  }
  game.fruit = null;
  game.pelletsEatenThisLevel = 0;
  game.stateTimer = 0;
}

export function togglePause(game) {
  if (game.state === STATE_PLAYING) {
    game.state = STATE_PAUSED;
  } else if (game.state === STATE_PAUSED) {
    game.state = STATE_PLAYING;
  }
}

export function addScore(game, pts) {
  const oldScore = game.score;
  game.score += pts;
  if (game.score > game.highScore) {
    game.highScore = game.score;
    if (game.storage) {
      try {
        game.storage.setItem('pacman_fps_highscore', String(game.highScore));
      } catch (e) {}
    }
  }
  if (oldScore < 10000 && game.score >= 10000) {
    game.lives++;
    game.soundEvents.push('extra_life');
  }
}

export function spawnFruit(game) {
  const points = game.level === 1 ? 100 : (game.level === 2 ? 300 : 500);
  game.fruit = {
    active: true,
    x: 13.5,
    y: 17.5,
    points,
    timer: 10.0,
    type: game.level === 1 ? 'cherry' : (game.level === 2 ? 'strawberry' : 'apple')
  };
}

export function stepGame(game, dt) {
  if (game.state === STATE_PAUSED || game.state === STATE_TITLE || game.state === STATE_GAME_OVER) {
    return;
  }

  if (game.state === STATE_PACMAN_DYING) {
    game.stateTimer += dt;
    if (game.stateTimer >= 1.5) {
      if (game.lives <= 0) {
        game.state = STATE_GAME_OVER;
      } else {
        game.player = createPlayer(game.maze.spawns.pacman);
        game.ghosts = createGhosts();
        game.state = STATE_PLAYING;
        game.stateTimer = 0;
      }
    }
    return;
  }

  if (game.state === STATE_GHOST_EATEN_PAUSE) {
    game.stateTimer += dt;
    if (game.stateTimer >= 0.5) {
      game.state = STATE_PLAYING;
      game.stateTimer = 0;
      game.eatenGhostPoints = null;
    }
    return;
  }

  if (game.state === STATE_LEVEL_CLEAR) {
    game.stateTimer += dt;
    if (game.stateTimer >= 2.0) {
      startLevel(game, game.level + 1);
      game.state = STATE_PLAYING;
    }
    return;
  }

  // STATE_PLAYING
  updateMovement(game.player, dt, game.maze);
  updateAngle(game.player, dt);

  // Check pellet eating
  const pelletResult = game.maze.eatPellet(game.player.x, game.player.y);
  if (pelletResult) {
    addScore(game, pelletResult.points);
    game.pelletsEatenThisLevel++;
    if (pelletResult.type === 'power') {
      const duration = Math.max(2.0, 7.0 - (game.level - 1) * 0.6);
      triggerFrightened(game.ghosts, duration);
      game.soundEvents.push('power');
    } else {
      game.soundEvents.push('waka');
    }

    if (game.pelletsEatenThisLevel === 70 || game.pelletsEatenThisLevel === 170) {
      spawnFruit(game);
    }
  }

  // Check fruit eating
  if (game.fruit && game.fruit.active) {
    game.fruit.timer -= dt;
    if (game.fruit.timer <= 0) {
      game.fruit.active = false;
    } else {
      const distToFruit = Math.hypot(game.player.x - game.fruit.x, game.player.y - game.fruit.y);
      if (distToFruit < 0.6) {
        addScore(game, game.fruit.points);
        game.fruit.active = false;
        game.soundEvents.push('fruit');
      }
    }
  }

  // Update ghosts
  updateGhostAI(game.ghosts, game.player, dt, game.maze);

  // Check collisions between player and ghosts
  for (const ghost of game.ghosts.list) {
    const dist = Math.hypot(game.player.x - ghost.x, game.player.y - ghost.y);
    if (dist < 0.65) {
      if (ghost.mode === GHOST_MODE_FRIGHTENED) {
        const pts = eatGhost(ghost, game.ghosts);
        addScore(game, pts);
        game.soundEvents.push('eat_ghost');
        game.state = STATE_GHOST_EATEN_PAUSE;
        game.stateTimer = 0;
        game.eatenGhostPoints = { points: pts, x: ghost.x, y: ghost.y };
        break;
      } else if (ghost.mode === GHOST_MODE_CHASE || ghost.mode === GHOST_MODE_SCATTER) {
        game.lives--;
        game.soundEvents.push('die');
        if (game.lives <= 0) {
          game.state = STATE_GAME_OVER;
        } else {
          game.state = STATE_PACMAN_DYING;
          game.stateTimer = 0;
        }
        break;
      }
    }
  }

  // Check level clear
  if (game.maze.pelletsRemaining <= 0) {
    game.state = STATE_LEVEL_CLEAR;
    game.stateTimer = 0;
    game.soundEvents.push('clear');
  }
}

export function updateGame(game, dt, options = {}) {
  const { fixedStep = null, maxDt = 0.1 } = options;
  const clampedDt = maxDt !== null ? Math.min(Math.max(dt, 0), maxDt) : Math.max(dt, 0);

  if (fixedStep) {
    game.accumulator = (game.accumulator || 0) + clampedDt;
    while (game.accumulator >= fixedStep - 1e-6) {
      stepGame(game, fixedStep);
      game.accumulator -= fixedStep;
    }
  } else {
    stepGame(game, clampedDt);
  }
}
