# Zombie Range: Terminal Survivor

**Zombie Range: Terminal Survivor** is a text-based Node.js shooting challenge that runs in the terminal. You are the last defender at a barricade while waves of zombies cross your sights. Aim with the arrow keys, fire with the spacebar, and survive the full round.

## Features

- **Story-driven zombie shooting challenge** with a terminal-style arcade feel.
- **Scoring system** that rewards successful shots.
- **Three difficulty levels**:
  - **Easy** – slower zombies and a forgiving hit window
  - **Medium** – balanced speed and challenge
  - **Hard** – faster zombies and stricter aiming
- **60-second countdown timer** per round.
- **Health system** that drops by **10% for each missed shot**.
- **Maximum of 3 misses** before game over.
- **Persistent high scores** saved locally in `scores.json`.
- **Menu system** for starting the game, viewing scores, and exiting.

---

## Repository Structure

```text
zombie-cli-game/
├── index.js       # Main game source
├── package.json   # Project metadata and npm scripts
├── README.md      # Documentation and setup instructions
└── scores.json    # Local high score storage (auto-created if missing)
