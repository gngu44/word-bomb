# Word Bomb

A fast-paced single-player word game built with React + TypeScript where players must type valid words containing a required chunk before the timer runs out.

This project is designed as a polished front-end product demo: real-time gameplay logic, audio feedback, difficulty scaling, and strong UX transitions from menu to countdown to game over.

## Why This Project Is Recruiter-Relevant

- Demonstrates interactive stateful UI engineering (multiple game states, timers, transitions, and validation flow).
- Uses clean TypeScript modeling for status management and typed gameplay logic.
- Implements non-trivial browser APIs (Web Audio API, localStorage) without external dependencies.
- Shows product thinking: onboarding flow, countdown sequencing, clear feedback loops, and replayability.

## Core Features

- Menu + pre-game flow
  - Start menu with `Start` and `How to Play`
  - Animated pre-game sequence: `Ready -> 3 -> 2 -> 1 -> Go`
- Gameplay loop
  - Letter-box visual input with chunk overlap highlighting
  - Score increments on valid words
  - Round timer shown as a shrinking progress bar
- Difficulty system
  - Timer starts at 10.0s and drops by 0.2s per correct guess (min 2.4s)
  - Chunk difficulty scales with score (short/common early, longer/harder later)
- Feedback systems
  - Typewriter clack per letter
  - Buzz for invalid submissions
  - Chime for valid submissions
  - Persistent ticking while playing
  - Defeat sting on game over
- End-state UX
  - Dedicated game over screen with final score and replay action

## Technical Stack

- React 19
- TypeScript 5
- Vite 7
- CSS (custom styling, keyframe animations)
- Browser APIs:
  - `localStorage` for persisted leaderboard data model
  - `AudioContext` for synthesized game sound effects

## Architecture Notes

- Single-page app with a typed finite-state style flow:
  - `loading`, `ready`, `howto`, `countdown`, `playing`, `gameover`
- Core game logic is centralized in `src/App.tsx`:
  - dictionary loading
  - timer loop
  - input validation
  - scoring and difficulty progression
  - audio triggers
- UI styling and animation are separated into `src/App.css`

## Running Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Project Structure

```text
src/
  App.tsx        # game state machine, gameplay logic, audio, rendering
  App.css        # visual design + animation
  main.tsx       # app bootstrap
public/
  words.txt      # dictionary source for validation
```

## Next Improvements

- Extract game logic into isolated modules/hooks for easier unit testing
- Add mobile-specific layout tuning for long chunk/word sequences
- Add optional hosted leaderboard backend for cross-device persistence
- Integrate into a discord bot
