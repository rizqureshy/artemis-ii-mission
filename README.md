# Artemis II Interactive Mission Presentation

  An interactive 3D presentation of NASA's Artemis II lunar free-return mission featuring:

  - **3D Graphics** — Three.js/React Three Fiber with Earth, Moon, Sun, stars, and animated spacecraft
  - **Voice Narration** — ElevenLabs TTS with dual voices (Brian narrator + Rachel computer)
  - **AI Commentary** — GPT-4o generates real-time mission briefings at each waypoint
  - **Cinematic Soundtrack** — ElevenLabs-generated orchestral background music
  - **Stage Sound Effects** — Unique ambient sounds for each mission phase (launch, transit, lunar flyby, re-entry, splashdown)
  - **Multiple Cameras** — Cockpit (1st person), Chase, and Orbit view modes
  - **Live Telemetry** — O₂, propellant, power, comms, heat shield readouts
  - **Flight Instruments** — Gimbal compass, gravity meter, booster status, nav mode, distance gauges
  - **11 Waypoints** — From Launch to Splashdown across a 10-day mission timeline

  ## Setup

  1. Clone the repo
  2. Run `npm install`
  3. Set environment variables:
     - `ELEVENLABS_API_KEY` — ElevenLabs API key for voice narration and sound effects
     - `OPENAI_API_KEY` — OpenAI API key for GPT-4o mission commentary
  4. Add texture files to `client/public/textures/`:
     - `earth.jpg` — 2K Earth texture
     - `launch-bg.png` — Launch background image
     - `moon.jpg` — Moon texture (already included)
  5. Run `npm run dev`

  ## Tech Stack

  - React 18 + TypeScript
  - Three.js / @react-three/fiber / @react-three/drei
  - Express.js backend
  - ElevenLabs TTS & Sound Generation APIs
  - OpenAI GPT-4o (JSON mode)
  - Tailwind CSS + shadcn/ui
  - Vite

  ## License

  MIT
  