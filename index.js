#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCORES_FILE = path.join(__dirname, 'scores.json');
const ROUND_TIME_SECONDS = 60;
const BOARD_WIDTH = 28;
const BOARD_HEIGHT = 7;
const FRAME_MS = 100;

const DIFFICULTY = {
  easy: {
    name: 'Easy',
    speedMin: 0.35,
    speedMax: 0.7,
    spawnEveryMs: 1500,
    hitTolerance: 1,
    scorePerHit: 10,
  },
  medium: {
    name: 'Medium',
    speedMin: 0.7,
    speedMax: 1.15,
    spawnEveryMs: 1000,
    hitTolerance: 0,
    scorePerHit: 15,
  },
  hard: {
    name: 'Hard',
    speedMin: 1.15,
    speedMax: 1.75,
    spawnEveryMs: 700,
    hitTolerance: 0,
    scorePerHit: 20,
  },
};

function clearScreen() {
  process.stdout.write('\x1Bc');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function loadScores() {
  try {
    if (!fs.existsSync(SCORES_FILE)) {
      fs.writeFileSync(SCORES_FILE, '[]', 'utf8');
    }
    return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

function saveScores(scores) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2), 'utf8');
}

function addScore(entry) {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score || a.time.localeCompare(b.time));
  saveScores(scores.slice(0, 10));
}

function renderMenu() {
  clearScreen();
  console.log('====================================');
  console.log('   ZOMBIE RANGE: TERMINAL SURVIVOR  ');
  console.log('====================================\n');
  console.log('1) Start game');
  console.log('2) View high scores');
  console.log('3) Exit\n');
  console.log('Story: A zombie horde is closing in on your barricade.');
  console.log('Use your reflexes to aim and blast them before time runs out.\n');
}

function renderScores() {
  clearScreen();
  console.log('========== HIGH SCORES ==========');
  const scores = loadScores();

  if (!scores.length) {
    console.log('No scores yet. Be the first survivor!');
  } else {
    scores.forEach((score, index) => {
      console.log(
        `${String(index + 1).padStart(2, '0')}. ${score.name.padEnd(12)} ${String(score.score).padStart(4, ' ')} pts | ${score.level}`
      );
    });
  }

  console.log('=================================\n');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function createZombie(config) {
  const direction = Math.random() > 0.5 ? 1 : -1;

  return {
    x: direction === 1 ? 0 : BOARD_WIDTH - 1,
    y: randomInt(0, BOARD_HEIGHT - 1),
    direction,
    speed: randomRange(config.speedMin, config.speedMax),
    symbol: Math.random() > 0.5 ? 'Z' : 'X',
  };
}

function drawBoard(state) {
  const grid = Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => '.')
  );

  state.zombies.forEach((z) => {
    const zx = Math.round(z.x);
    if (zx >= 0 && zx < BOARD_WIDTH && z.y >= 0 && z.y < BOARD_HEIGHT) {
      grid[z.y][zx] = z.symbol;
    }
  });

  const current = grid[state.crosshair.y][state.crosshair.x];
  grid[state.crosshair.y][state.crosshair.x] = current === '.' ? '+' : '*';

  const rows = grid.map((row) => `|${row.join('')}|`);
  const border = '+' + '-'.repeat(BOARD_WIDTH) + '+';

  return [border, ...rows, border].join('\n');
}

function instructions(config) {
  return [
    `Difficulty: ${config.name}`,
    'Controls: Arrow keys to aim | Spacebar to shoot | q to quit round',
    'Zombie legend: Z / X   Crosshair: +   Hit marker: *',
    'Miss a shot and lose 10% health. Three misses ends the run.',
  ].join('\n');
}

async function selectDifficulty(rl) {
  while (true) {
    clearScreen();
    console.log('Choose difficulty:\n');
    console.log('1) Easy   - slower zombies, bigger hit window');
    console.log('2) Medium - balanced challenge');
    console.log('3) Hard   - fast zombies, strict aim\n');

    const input = (await ask(rl, 'Select 1, 2, or 3: ')).trim();

    if (input === '1') return DIFFICULTY.easy;
    if (input === '2') return DIFFICULTY.medium;
    if (input === '3') return DIFFICULTY.hard;
  }
}

async function saveScoreFlow(rl, score, level) {
  const nameRaw = (await ask(rl, 'Enter your survivor name for the scoreboard: ')).trim();
  const name = nameRaw || 'Anonymous';

  addScore({
    name: name.slice(0, 12),
    score,
    level,
    time: new Date().toISOString(),
  });
}

async function gameLoop(config) {
  let resolveEnd;
  const resultPromise = new Promise((resolve) => {
    resolveEnd = resolve;
  });

  const state = {
    startTime: Date.now(),
    endTime: Date.now() + ROUND_TIME_SECONDS * 1000,
    score: 0,
    misses: 0,
    health: 100,
    crosshair: {
      x: Math.floor(BOARD_WIDTH / 2),
      y: Math.floor(BOARD_HEIGHT / 2),
    },
    zombies: [],
    lastSpawn: 0,
    active: true,
    message: 'Defend the barricade!',
  };

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const onKeyPress = (_str, key) => {
    if (!state.active || !key) return;

    switch (key.name) {
      case 'up':
        state.crosshair.y = clamp(state.crosshair.y - 1, 0, BOARD_HEIGHT - 1);
        break;
      case 'down':
        state.crosshair.y = clamp(state.crosshair.y + 1, 0, BOARD_HEIGHT - 1);
        break;
      case 'left':
        state.crosshair.x = clamp(state.crosshair.x - 1, 0, BOARD_WIDTH - 1);
        break;
      case 'right':
        state.crosshair.x = clamp(state.crosshair.x + 1, 0, BOARD_WIDTH - 1);
        break;
      case 'space': {
        let hitIndex = -1;

        for (let i = 0; i < state.zombies.length; i += 1) {
          const z = state.zombies[i];
          const dx = Math.abs(Math.round(z.x) - state.crosshair.x);
          const dy = Math.abs(z.y - state.crosshair.y);

          if (dx <= config.hitTolerance && dy === 0) {
            hitIndex = i;
            break;
          }
        }

        if (hitIndex >= 0) {
          const target = state.zombies[hitIndex];
          state.zombies.splice(hitIndex, 1);
          state.score += config.scorePerHit;
          state.message = `Headshot! +${config.scorePerHit} points (row ${target.y + 1}).`;
        } else {
          state.misses += 1;
          state.health = Math.max(0, 100 - state.misses * 10);
          state.message = `Missed! Health now ${state.health}%.`;

          if (state.misses >= 3) {
            state.active = false;
            resolveEnd({
              score: state.score,
              reason: 'You missed three shots. The zombies overwhelmed you!',
            });
          }
        }
        break;
      }
      case 'q':
        state.active = false;
        resolveEnd({
          score: state.score,
          reason: 'You abandoned the barricade and retreated.',
        });
        break;
      case 'c':
        if (key.ctrl) {
          state.active = false;
          resolveEnd({
            score: state.score,
            reason: 'Game interrupted.',
          });
        }
        break;
      default:
        break;
    }
  };

  process.stdin.on('keypress', onKeyPress);

  const frame = setInterval(() => {
    if (!state.active) return;

    const now = Date.now();

    if (now - state.lastSpawn >= config.spawnEveryMs) {
      state.zombies.push(createZombie(config));
      state.lastSpawn = now;
    }

    state.zombies.forEach((z) => {
      z.x += z.direction * z.speed;
    });

    state.zombies = state.zombies.filter((z) => z.x > -1 && z.x < BOARD_WIDTH);

    const remaining = Math.max(0, Math.ceil((state.endTime - now) / 1000));

    clearScreen();
    console.log('ZOMBIE RANGE: TERMINAL SURVIVOR\n');
    console.log(instructions(config));
    console.log('\n' + drawBoard(state));
    console.log(
      `\nScore: ${state.score}   Level: ${config.name}   Health: ${state.health}%   Misses: ${state.misses}/3   Time: ${remaining}s`
    );
    console.log(`Status: ${state.message}`);

    if (remaining <= 0) {
      state.active = false;
      resolveEnd({
        score: state.score,
        reason: 'Time is up! You survived the round.',
      });
    }
  }, FRAME_MS);

  const result = await resultPromise;

  clearInterval(frame);
  process.stdin.off('keypress', onKeyPress);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  process.stdin.pause();
  return result;
}

async function startGame() {
  const difficultyRl = createInterface();
  const config = await selectDifficulty(difficultyRl);
  difficultyRl.close();

  clearScreen();
  console.log('Get ready...\n');
  console.log(instructions(config));
  console.log('\nStarting in 3...');
  await sleep(1000);
  console.log('2...');
  await sleep(1000);
  console.log('1...');
  await sleep(1000);

  const result = await gameLoop(config);

  const gameplayRl = createInterface();
  clearScreen();
  console.log('========== ROUND OVER ==========');
  console.log(result.reason);
  console.log(`Final score: ${result.score}`);
  console.log(`Difficulty: ${config.name}`);
  console.log('================================\n');
  await saveScoreFlow(gameplayRl, result.score, config.name);
  gameplayRl.close();

  const pauseRl = createInterface();
  await ask(pauseRl, 'Score saved! Press Enter to return to the menu...');
  pauseRl.close();
}

async function main() {
  let rl = createInterface();

  while (true) {
    renderMenu();
    const choice = (await ask(rl, 'Choose an option: ')).trim();

    if (choice === '1') {
      rl.close();
      await startGame();
      rl = createInterface();
    } else if (choice === '2') {
      renderScores();
      await ask(rl, 'Press Enter to return to the menu...');
    } else if (choice === '3') {
      clearScreen();
      console.log('Thanks for playing Zombie Range. Stay safe, survivor!');
      rl.close();
      process.exit(0);
    }
  }
}

main().catch((error) => {
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch (_error) {
      // ignore cleanup failures
    }
  }

  console.error('Unexpected error:', error);
  process.exit(1);
});
``