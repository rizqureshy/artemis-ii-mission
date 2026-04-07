# Artemis II Interactive Mission Presentation

## Overview

An interactive 3D space mission presentation of NASA's Artemis II lunar free-return mission. Features Three.js/R3F 3D graphics, ElevenLabs voice narration, AI-powered GPT-4o mission commentary, animated spacecraft traversing a lunar free-return trajectory, multiple camera modes, live telemetry readouts, and waypoint markers at each mission checkpoint.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **3D Rendering**: Three.js via @react-three/fiber and @react-three/drei
- **Cameras**: Cockpit (first-person), Chase, and Orbit view modes
- **State Management**: React hooks
- **Routing**: Wouter
- **Styling**: Tailwind CSS with shadcn/ui
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **AI Commentary**: OpenAI GPT-4o via Replit AI Integrations (JSON mode)
- **Voice Narration**: ElevenLabs TTS API (voice "Brian", eleven_turbo_v2_5)

### Key Components
- **SpaceScene**: 3D scene with Earth, Moon, stars, trajectory line, waypoint markers, spacecraft
- **CameraRig**: Manages cockpit/chase camera positions along trajectory
- **WaypointBeacon**: Minimal floating dot + label at each checkpoint (clickable)
- **AirPointer**: Floating bottom-center overlay showing checkpoint info (replaces old side panel)
- **CockpitOverlay**: HUD with telemetry (O₂, propellant, power, comms, heat shield) plus cockpit instruments
- **InstrumentPanel**: Left-side panel in orbit/chase views with all flight instruments
- **GimbalCompass**: SVG attitude indicator with roll/pitch/heading
- **GravityMeter**: Dual Earth/Moon gravity influence bars (m/s²)
- **BoosterStatus**: SRB L/R, Core, ICPS status lights (ACTIVE/SEP/STBY)
- **NavStatus**: Navigation mode indicator with ATT HOLD, FREE DFT, STAR TRK lights
- **DistanceGauges**: Distance from Earth and distance to Moon with progress bars
- **SpaceAudio**: Ambient low-frequency drone + cockpit beeps/chirps
- **Intro Briefing**: Immersive mission briefing with rocket specs, crew manifest, position context

### Mission Data
- 11 waypoints from Launch to Splashdown with t-values along trajectory curve
- Trajectory: CatmullRomCurve3 free-return path from Earth around Moon and back
- BASE_SPEED: 0.005 (~200s full mission at 1×, ~67s at 3×)

### API Endpoints
- `POST /api/mission/commentary` — GPT-4o generates headline, subtitle, commentary, risk level, ship status
- `POST /api/mission/narrate` — ElevenLabs TTS converts text to speech audio (Brian voice, narrator)
- `POST /api/mission/computer-voice` — ElevenLabs TTS for computer announcements (Rachel voice)
- `GET /api/mission/background-music` — ElevenLabs Sound Generation API: looping jazz background music
- `GET /api/mission/stage-sound/:stage` — ElevenLabs Sound Generation API: unique ambient sounds per mission stage (ascent, tli, outbound, lunar, farside, return, reentry, splashdown)

### Narration Flow
- Auto-triggered at each waypoint during playback; queue-based (max 1 pending)
- Manual triggers (beacon click) bypass queue with force=true and stop current narration
- Speaks: commentary only (1 short sentence, ~12s max spoken) — brief and focused
- Generation counter (narrationGenRef) prevents stale fetches from playing after stop/reset
- Computer voice (camera lock announcements) skips if main narration is active
- Commentary pre-fetched ~6% before each waypoint; cached in window.__artemisCache

### Environment Variables
- `ELEVENLABS_API_KEY` — ElevenLabs TTS API key
- OpenAI via Replit AI Integrations (AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL)

## Project Structure
```
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   └── artemis-ii-presentation.tsx  # Main presentation component (~1600 lines)
│   │   ├── pages/
│   │   │   └── home.tsx
│   │   └── lib/
├── server/
│   ├── routes.ts          # AI commentary + TTS endpoints
│   ├── storage.ts
│   └── vite.ts
├── shared/
│   └── schema.ts
└── package.json
```

## External Dependencies
- **@react-three/fiber & drei**: 3D rendering
- **three**: Three.js core
- **openai**: GPT-4o commentary generation
- **tailwindcss**: Styling
- **express**: HTTP server
