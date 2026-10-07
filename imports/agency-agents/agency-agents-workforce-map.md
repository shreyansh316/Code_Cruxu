# HEADROOM WORKFORCE BLUEPRINT — AGENCY AGENTS ARRANGEMENT

## Executive Summary & Architectural Compliance

This document provides the authoritative workforce arrangement mapping imported capabilities from Agency Agents into **HEADROOM's four-tier organizational hierarchy**.

### Core Invariants Enforced
1. **Single Source of Truth**: HEADROOM's architecture, security boundaries, roadmap, and domain invariants remain unchanged.
2. **Hierarchy**: `CEO` $\to$ `AI Director` $\to$ `Office Head Manager` $\to$ `Department Manager` $\to$ `AI Employees [4]`.
3. **Four-Employee Invariant**: Every department strictly contains exactly **four** specialized employee positions (`EMPLOYEE_SLOTS = 4`).
4. **Four Offices**:
   - `game-development` (Game Development Office)
   - `website-development` (Website Development Office)
   - `app-development` (App Development Office)
   - `research-making` (Research / Making Office)
5. **No Production Integration**: This artifact is purely architectural and planning documentation. Zero runtime code, database schemas, or configurations have been altered.

---

## Workforce Topology Summary

| Office | Departments | Total Employee Positions | Key Coverage Areas |
| :--- | :---: | :---: | :--- |
| **Game Development** | 4 | 16 | Unreal (C++/GAS), Unity (SO/Tools), Godot, Luau/Roblox, Networking, Level/Game Design, Economy, Narrative, Shaders, Tech Art, XR, Audio, Profiling, Playtesting, Build |
| **Website Development** | 8 | 32 | Frontend, Backend, UI/UX, QA Testing, Security, DevOps, Database, Performance (Aligned with `src/constants.js` slugs) |
| **App Development** | 4 | 16 | Desktop (Electron/Tauri/Extension), Native Interop/Rust, Mobile (React Native/Flutter), Touch UI, Offline Sync, Cloud APIs, Auth/PKCE, App Store Distribution |
| **Research / Making** | 4 | 16 | Literature Synthesis, Codebase Archaeology, Rapid Prototyping, Embedded Firmware, IoT, Systems Safety/Rust, AI Prompts/Evals, RAG Systems, Technical Documentation |
| **TOTAL** | **20** | **80** | **80 Highly Specialized Professional Roles Across 20 Coherent Departments** |

---

## OFFICE: GAME DEVELOPMENT (`game-development`)

*Real-time interactive entertainment, engine systems, game design, tech art, and multiplayer architecture.*

### Department: Game Engine Systems (`game-engine-systems`)

- **Department Purpose**: Core game engine programming, gameplay mechanics, systems logic, and network simulation.
- **Manager Responsibility**: Coordinates engine architecture alignment, runtime stability, and tick/frame performance budgets.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Unreal Systems Engineer — *Senior Unreal Engine Systems Specialist*
- **Primary Responsibility**: Unreal C++ architecture, Gameplay Ability System (GAS), and engine subsystems.
- **Secondary Skills**: Actor replication, Memory management, Subsystem lifecycles
- **Technologies Covered**: Unreal Engine 5 / 4.27, C++, GAS, Unreal Build Tool
- **Task Routing Types**: `gameplay-systems`, `ability-system`, `unreal-architecture`, `actor-lifecycle`
- **Tool Permissions Required**: Filesystem: read (Source/**, Config/**, *.uproject), write (Source/**, Config/**); Process commands: dotnet, build, msbuild
- **Verification Standard**: Compile check with Unreal Build Tool; unit tests in Unreal Test Automation harness.
- **Agency Source Provenance**: [`unreal-systems-engineer.md`](file:///imports/agency-agents/game-development/unreal-engine/unreal-systems-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 2: Unity Systems Architect — *Senior Unity Data-Driven Systems Architect*
- **Primary Responsibility**: ScriptableObject modular architecture, decoupled event channels, and component composition.
- **Secondary Skills**: Custom Editor inspectors, Prefab serialization hygiene, Memory leak prevention
- **Technologies Covered**: Unity 2022/6, C#, ScriptableObjects, Unity Package Manager
- **Task Routing Types**: `unity-systems`, `scriptable-objects`, `component-refactoring`, `editor-tools`
- **Tool Permissions Required**: Filesystem: read (Assets/**, Packages/**, ProjectSettings/**), write (Assets/**, ProjectSettings/**); Process commands: dotnet, unity-cmd
- **Verification Standard**: Unity Test Runner batch execution; zero missing reference checks; assembly definition validation.
- **Agency Source Provenance**: [`unity-architect.md`](file:///imports/agency-agents/game-development/unity/unity-architect.md), [`unity-editor-tool-developer.md`](file:///imports/agency-agents/game-development/unity/unity-editor-tool-developer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 3: Godot & Multiplatform Gameplay Scripter — *Godot & Multiplatform Gameplay Specialist*
- **Primary Responsibility**: Godot GDScript/C# node hierarchies, scene state machines, and Roblox Luau gameplay scripting.
- **Secondary Skills**: Roblox client-server boundaries, Cross-engine 2D/3D prototypes, Input mapping
- **Technologies Covered**: Godot 4.x, GDScript, C#, Luau / Roblox Studio
- **Task Routing Types**: `godot-gameplay`, `roblox-scripting`, `node-architecture`, `scene-tree`
- **Tool Permissions Required**: Filesystem: read (scenes/**, scripts/**, project.godot, *.rbxl), write (scenes/**, scripts/**); Process commands: godot, rojo
- **Verification Standard**: Godot headless GUT test execution; Luau type check and linter.
- **Agency Source Provenance**: [`godot-gameplay-scripter.md`](file:///imports/agency-agents/game-development/godot/godot-gameplay-scripter.md), [`roblox-systems-scripter.md`](file:///imports/agency-agents/game-development/roblox-studio/roblox-systems-scripter.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 4 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 4: Multiplayer Network Engineer — *Game Networking & Multiplayer Architect*
- **Primary Responsibility**: Network replication, client-side prediction, server reconciliation, and tick simulations.
- **Secondary Skills**: RPC optimization, Bandwidth profiling, Lag compensation, Session matchmaking
- **Technologies Covered**: Unreal Replication, Unity Netcode for GameObjects, Godot High-Level Multiplayer, WebSockets
- **Task Routing Types**: `network-replication`, `multiplayer-sync`, `tick-simulation`, `bandwidth-optimization`
- **Tool Permissions Required**: Filesystem: read (Source/**, Assets/**, scripts/**), write (Source/**, Assets/**, scripts/**); Process commands: dotnet, pytest
- **Verification Standard**: Multi-client loopback tests, latency simulation verification, packet inspection logs.
- **Agency Source Provenance**: [`unreal-multiplayer-architect.md`](file:///imports/agency-agents/game-development/unreal-engine/unreal-multiplayer-architect.md), [`unity-multiplayer-engineer.md`](file:///imports/agency-agents/game-development/unity/unity-multiplayer-engineer.md), [`godot-multiplayer-engineer.md`](file:///imports/agency-agents/game-development/godot/godot-multiplayer-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

### Department: Game Design & Creative Systems (`game-design-creative`)

- **Department Purpose**: Core gameplay mechanics, level architecture, narrative integration, and game economies.
- **Manager Responsibility**: Ensures gameplay loops, level flow, narrative beats, and economy curves form a balanced experience.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Core Mechanics & Experience Designer — *Lead Gameplay Mechanics & Experience Designer*
- **Primary Responsibility**: Core gameplay loop definition, control feel, player mechanics, and moment-to-moment engagement.
- **Secondary Skills**: FTUE (First-Time User Experience), Player onboarding, Input curve tuning
- **Technologies Covered**: Game Design Documents (GDD), Machinations, Roblox Experience Design
- **Task Routing Types**: `gdd-creation`, `mechanics-design`, `onboarding-flow`, `gameplay-tuning`
- **Tool Permissions Required**: Filesystem: read (docs/design/**, Configs/**, Data/**), write (docs/design/**, Configs/**, Data/**); Process commands: none
- **Verification Standard**: Design spec review, configuration table consistency, mathematical balance checks.
- **Agency Source Provenance**: [`game-designer.md`](file:///imports/agency-agents/game-development/game-designer.md), [`roblox-experience-designer.md`](file:///imports/agency-agents/game-development/roblox-studio/roblox-experience-designer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 4 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Level & World Designer — *Level Architecture & World Building Specialist*
- **Primary Responsibility**: Spatial layouts, encounter pacing, player guiding, sightlines, and streaming world partitions.
- **Secondary Skills**: PCG (Procedural Content Generation), Blockouts / greyboxing, Collision validation
- **Technologies Covered**: Unreal World Partition, PCG Framework, Unity ProBuilder, Godot GridMap
- **Task Routing Types**: `level-blockout`, `world-partitioning`, `pacing-layout`, `pcg-rules`
- **Tool Permissions Required**: Filesystem: read (Content/Maps/**, Assets/Scenes/**, docs/levels/**), write (Content/Maps/**, Assets/Scenes/**, docs/levels/**); Process commands: none
- **Verification Standard**: Map collision checks, streaming partition bounds validation, traversal timing tests.
- **Agency Source Provenance**: [`level-designer.md`](file:///imports/agency-agents/game-development/level-designer.md), [`unreal-world-builder.md`](file:///imports/agency-agents/game-development/unreal-engine/unreal-world-builder.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 3: Game Economy & Progression Balancer — *In-Game Economy & Progression Balancer*
- **Primary Responsibility**: Currency sinks and faucets, progression curves, itemization tiers, and reward balancing.
- **Secondary Skills**: Loot tables, Monetization ethics checking, Drop rate math, Inflation models
- **Technologies Covered**: Spreadsheet modeling, JSON/CSV balancing data, Monte Carlo simulation
- **Task Routing Types**: `economy-balancing`, `progression-curves`, `loot-tables`, `drop-rates`
- **Tool Permissions Required**: Filesystem: read (Data/Economy/**, Data/Progression/**), write (Data/Economy/**, Data/Progression/**); Process commands: node
- **Verification Standard**: Monte Carlo simulation runs (10,000 player journeys); inflation threshold checks.
- **Agency Source Provenance**: [`economy-designer.md`](file:///imports/agency-agents/game-development/economy-designer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Narrative & Quest Designer — *Narrative Systems & Branching Dialogue Designer*
- **Primary Responsibility**: Branching dialogue trees, quest state graphs, environmental storytelling, and lore consistency.
- **Secondary Skills**: Localization key tagging, NPC state machines, Cutscene script timing
- **Technologies Covered**: Yarn Spinner, Ink, Twine, Custom Dialogue JSON
- **Task Routing Types**: `dialogue-trees`, `quest-design`, `narrative-scripting`, `lore-spec`
- **Tool Permissions Required**: Filesystem: read (Data/Dialogues/**, Data/Quests/**, docs/narrative/**), write (Data/Dialogues/**, Data/Quests/**, docs/narrative/**); Process commands: none
- **Verification Standard**: Dialogue acyclic graph validation, dead-end state checks, quest condition unit tests.
- **Agency Source Provenance**: [`narrative-designer.md`](file:///imports/agency-agents/game-development/narrative-designer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Technical Art & Audio Pipeline (`tech-art-audio`)

- **Department Purpose**: 3D asset integration, real-time shaders, visual effects, spatial audio, and XR immersion.
- **Manager Responsibility**: Controls visual performance budgets (draw calls, vertex counts, shader complexity) and audio fidelity.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Real-Time Technical Artist — *DCC-to-Engine Technical Artist & Asset Automator*
- **Primary Responsibility**: DCC asset export/import pipelines, skeletal rigging, skinning validation, and Blender automation.
- **Secondary Skills**: Avatar systems, LOD generation, Texture atlas packing, Mesh optimization
- **Technologies Covered**: Blender Python API, FBX/glTF pipelines, Roblox Avatar Rigging
- **Task Routing Types**: `asset-pipeline`, `blender-automation`, `rigging-validation`, `lod-optimization`
- **Tool Permissions Required**: Filesystem: read (Art/**, Assets/Models/**, scripts/blender/**), write (Assets/Models/**, scripts/blender/**); Process commands: blender, python
- **Verification Standard**: Asset polycount/bone count automated audit; vertex normal and UV validation scripts.
- **Agency Source Provenance**: [`technical-artist.md`](file:///imports/agency-agents/game-development/technical-artist.md), [`blender-addon-engineer.md`](file:///imports/agency-agents/game-development/blender/blender-addon-engineer.md), [`roblox-avatar-creator.md`](file:///imports/agency-agents/game-development/roblox-studio/roblox-avatar-creator.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 2: Shader & Graphics Developer — *Real-Time Shader & GPU Performance Engineer*
- **Primary Responsibility**: Custom HLSL/GLSL shaders, Unity Shader Graph, Unreal Materials/Niagara, and GPU profiling.
- **Secondary Skills**: Post-processing effects, Overdraw minimization, Compute shaders, Metal/Vulkan
- **Technologies Covered**: HLSL, GLSL, Shader Graph, Niagara VFX, Apple Metal
- **Task Routing Types**: `shader-creation`, `vfx-pipeline`, `gpu-profiling`, `render-feature`
- **Tool Permissions Required**: Filesystem: read (Shaders/**, Materials/**, VFX/**), write (Shaders/**, Materials/**, VFX/**); Process commands: none
- **Verification Standard**: Shader compilation check on target graphics APIs; instruction count and texture sample benchmarks.
- **Agency Source Provenance**: [`unity-shader-graph-artist.md`](file:///imports/agency-agents/game-development/unity/unity-shader-graph-artist.md), [`unreal-technical-artist.md`](file:///imports/agency-agents/game-development/unreal-engine/unreal-technical-artist.md), [`godot-shader-developer.md`](file:///imports/agency-agents/game-development/godot/godot-shader-developer.md), [`macos-spatial-metal-engineer.md`](file:///imports/agency-agents/spatial-computing/macos-spatial-metal-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 3: Spatial & XR Interaction Developer — *Immersive VR/AR & Spatial Interface Engineer*
- **Primary Responsibility**: Spatial UI ergonomics, 6DoF controller/hand tracking, gaze-pinch gestures, and XR comfort.
- **Secondary Skills**: Simulated cockpit interactions, Stereoscopic optimization, Foveated rendering
- **Technologies Covered**: OpenXR, visionOS RealityKit, Unity XR Interaction Toolkit, Unreal OpenXR
- **Task Routing Types**: `xr-interactions`, `spatial-ui`, `hand-tracking`, `vr-comfort`
- **Tool Permissions Required**: Filesystem: read (XR/**, SpatialUI/**), write (XR/**, SpatialUI/**); Process commands: none
- **Verification Standard**: Simulated 6DoF interaction unit tests; frame rate stability audit (target 90/120 Hz).
- **Agency Source Provenance**: [`xr-immersive-developer.md`](file:///imports/agency-agents/spatial-computing/xr-immersive-developer.md), [`xr-interface-architect.md`](file:///imports/agency-agents/spatial-computing/xr-interface-architect.md), [`visionos-spatial-engineer.md`](file:///imports/agency-agents/spatial-computing/visionos-spatial-engineer.md), [`xr-cockpit-interaction-specialist.md`](file:///imports/agency-agents/spatial-computing/xr-cockpit-interaction-specialist.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 4: Game Audio & Acoustic Engineer — *Dynamic Game Audio & Soundscapes Engineer*
- **Primary Responsibility**: Dynamic sound design, middleware sound banks (FMOD/Wwise), audio mixing, and spatial audio.
- **Secondary Skills**: Adaptive music transitions, Voice-over mastering, Reverb zones, DSP filters
- **Technologies Covered**: FMOD Studio, Wwise, Unity AudioSource, Unreal MetaSounds
- **Task Routing Types**: `audio-implementation`, `soundbank-setup`, `spatial-acoustics`, `voice-pipeline`
- **Tool Permissions Required**: Filesystem: read (Audio/**, Content/Audio/**, Assets/Audio/**), write (Audio/**, Content/Audio/**, Assets/Audio/**); Process commands: none
- **Verification Standard**: Audio bank build verification; voice concurrency and memory footprint budget audit.
- **Agency Source Provenance**: [`game-audio-engineer.md`](file:///imports/agency-agents/game-development/game-audio-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Game Production & QA Optimization (`game-production-qa`)

- **Department Purpose**: Studio scheduling, frame performance profiling, automated gameplay testing, and build packaging.
- **Manager Responsibility**: Oversees build gates, regression stability across target platforms, and delivery milestones.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Studio Production Coordinator — *Game Studio Delivery & Pipeline Coordinator*
- **Primary Responsibility**: Cross-discipline milestone tracking, asset handoff schedules, and dependency blocker resolution.
- **Secondary Skills**: Sprint backlog grooming, Build distribution schedules, Risk registries
- **Technologies Covered**: Milestone tracking, Dependency matrices, Release checksheets
- **Task Routing Types**: `production-scheduling`, `dependency-tracking`, `milestone-coordination`
- **Tool Permissions Required**: Filesystem: read (docs/production/**, milestones/**), write (docs/production/**, milestones/**); Process commands: none
- **Verification Standard**: Dependency graph cycle detection; delivery checklist signoff verification.
- **Agency Source Provenance**: [`project-management-studio-producer.md`](file:///imports/agency-agents/project-management/project-management-studio-producer.md), [`project-management-studio-operations.md`](file:///imports/agency-agents/project-management/project-management-studio-operations.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 4 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Game Performance & Profiling Engineer — *Frame-Time & Runtime Memory Optimization Engineer*
- **Primary Responsibility**: Frame-time diagnostics, CPU/GPU profiling, memory leak detection, and draw call batching.
- **Secondary Skills**: Garbage collection optimization, Asset streaming bottlenecks, Thermal throttling
- **Technologies Covered**: Unreal Unreal Insights, Unity Profiler, RenderDoc, PIX
- **Task Routing Types**: `frame-profiling`, `memory-budget-audit`, `draw-call-optimization`, `bottleneck-analysis`
- **Tool Permissions Required**: Filesystem: read (Source/**, Assets/**, benchmarks/**), write (benchmarks/**); Process commands: node, pytest
- **Verification Standard**: Automated benchmark runs with frame time percentiles (<16.6ms for 60fps; <11.1ms for 90fps).
- **Agency Source Provenance**: [`engineering-autonomous-optimization-architect.md`](file:///imports/agency-agents/engineering/engineering-autonomous-optimization-architect.md), [`testing-performance-benchmarker.md`](file:///imports/agency-agents/testing/testing-performance-benchmarker.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 3: Game QA & Automated Playtester — *Automated Gameplay Test & Regression Specialist*
- **Primary Responsibility**: Headless gameplay smoke tests, deterministic input replay, and regression test harnesses.
- **Secondary Skills**: Save/load state fuzzing, Physics glitch detection, Boundary clipping tests
- **Technologies Covered**: Gauntlet (Unreal), Unity Test Framework, GUT (Godot), Custom replay bots
- **Task Routing Types**: `automated-playtest`, `input-replay`, `regression-test`, `save-state-fuzzing`
- **Tool Permissions Required**: Filesystem: read (tests/**, Assets/Tests/**, Source/**), write (tests/**, test-results/**); Process commands: node, pytest, dotnet
- **Verification Standard**: Zero crash exits on 100-loop smoke pass; complete test evidence bundle capture.
- **Agency Source Provenance**: [`testing-test-automation-engineer.md`](file:///imports/agency-agents/testing/testing-test-automation-engineer.md), [`testing-evidence-collector.md`](file:///imports/agency-agents/testing/testing-evidence-collector.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 4: Game Build & Distribution Engineer — *Game Build Pipeline & Platform Packaging Specialist*
- **Primary Responsibility**: Platform packaging, asset cooking, compiler optimization flags, and distribution artifacts.
- **Secondary Skills**: Steamworks / Epic Games SDK packaging, Symbol upload, Delta patch generation
- **Technologies Covered**: Unreal UAT, Unity Build Pipeline, SteamCMD, Fastlane
- **Task Routing Types**: `game-packaging`, `asset-cooking`, `symbol-archiving`, `release-build`
- **Tool Permissions Required**: Filesystem: read (Source/**, Assets/**, Config/**, build/**), write (build/**, dist/**); Process commands: dotnet, msbuild, tar, zip
- **Verification Standard**: VSIX / game package binary verification; checksum manifest generation; clean test install.
- **Agency Source Provenance**: [`engineering-developer-tooling-engineer.md`](file:///imports/agency-agents/engineering/engineering-developer-tooling-engineer.md), [`engineering-devops-automator.md`](file:///imports/agency-agents/engineering/engineering-devops-automator.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

## OFFICE: WEBSITE DEVELOPMENT (`website-development`)

*Modern responsive web applications, backend services, API platforms, cloud infrastructure, and security.*

### Department: Frontend Department (`frontend`)

- **Department Purpose**: Client-side web architecture, interactive UI components, accessibility, and localization.
- **Manager Responsibility**: Maintains frontend architecture consistency, bundle size budgets, and WCAG compliance.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Web UI Application Engineer — *Senior Web Application & UI Component Engineer*
- **Primary Responsibility**: Component architecture, reactive client-side state, modern CSS, and responsive layouts.
- **Secondary Skills**: Virtual scrolling, DOM optimization, Component unit testing
- **Technologies Covered**: HTML5, Vanilla CSS / CSS Modules, JavaScript / ESM, Web Components
- **Task Routing Types**: `ui-components`, `state-management`, `responsive-layout`, `client-logic`
- **Tool Permissions Required**: Filesystem: read (src/**, public/**, package.json), write (src/**, public/**); Process commands: npm, node
- **Verification Standard**: Component render unit tests; zero layout overflow in narrow/wide viewports.
- **Agency Source Provenance**: [`engineering-frontend-developer.md`](file:///imports/agency-agents/engineering/engineering-frontend-developer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Frontend Architecture & Wasm Engineer — *Frontend Platform & High-Performance Compute Specialist*
- **Primary Responsibility**: Client build configurations, bundlers (esbuild/Vite), WebAssembly modules, and client caching.
- **Secondary Skills**: Tree-shaking audits, Service Workers, Offline PWA caches
- **Technologies Covered**: esbuild, WebAssembly, Service Workers, Web Workers
- **Task Routing Types**: `frontend-build`, `wasm-integration`, `bundle-optimization`, `worker-threads`
- **Tool Permissions Required**: Filesystem: read (src/**, esbuild.js, package.json), write (src/**, out/**, esbuild.js); Process commands: node, npm
- **Verification Standard**: Bundle size metafile analysis; Wasm module memory safety and benchmark checks.
- **Agency Source Provenance**: [`engineering-webassembly-engineer.md`](file:///imports/agency-agents/engineering/engineering-webassembly-engineer.md), [`engineering-developer-tooling-engineer.md`](file:///imports/agency-agents/engineering/engineering-developer-tooling-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 3: Accessibility & WCAG Specialist — *Web Accessibility (A11y) & Section 508 Specialist*
- **Primary Responsibility**: WCAG 2.1 AA/AAA compliance, screen reader live regions, focus management, and keyboard navigation.
- **Secondary Skills**: Color contrast auditing, Touch target sizing, Aria landmark hierarchy
- **Technologies Covered**: ARIA 1.2, axe-core, Screen Reader APIs, Section 508
- **Task Routing Types**: `a11y-audit`, `aria-semantics`, `keyboard-navigation`, `contrast-check`
- **Tool Permissions Required**: Filesystem: read (src/**, tests/**), write (src/**, tests/**); Process commands: node, npm
- **Verification Standard**: Zero axe-core automated violations; keyboard traversal test pass without mouse traps.
- **Agency Source Provenance**: [`engineering-section-508-specialist.md`](file:///imports/agency-agents/engineering/engineering-section-508-specialist.md), [`testing-accessibility-auditor.md`](file:///imports/agency-agents/testing/testing-accessibility-auditor.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Internationalization & Localization Engineer — *Frontend i18n & Localization Specialist*
- **Primary Responsibility**: Resource bundle isolation, string externalization, RTL bidirectional layout, and formatting.
- **Secondary Skills**: Pluralization rules, Number/currency formatters, Locale detection
- **Technologies Covered**: Intl API, package.nls.json / i18next, Unicode CLDR
- **Task Routing Types**: `i18n-extraction`, `rtl-layout`, `locale-formatting`, `string-bundling`
- **Tool Permissions Required**: Filesystem: read (src/**, package.nls.json, locales/**), write (src/**, package.nls.json, locales/**); Process commands: none
- **Verification Standard**: Pseudo-localization test pass; missing key linting; RTL mirroring layout validation.
- **Agency Source Provenance**: [`engineering-i18n-engineer.md`](file:///imports/agency-agents/engineering/engineering-i18n-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Backend Department (`backend`)

- **Department Purpose**: Server-side domain architecture, API contracts, real-time message streams, and external services.
- **Manager Responsibility**: Oversees backend modularity, transactional consistency, and API backwards compatibility.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Backend Systems Architect — *Senior Modular Backend Architect*
- **Primary Responsibility**: Domain logic isolation, use-case factories, repository abstractions, and error boundaries.
- **Secondary Skills**: In-memory caching, Dependency injection, Unit of work transactions
- **Technologies Covered**: Node.js, Clean Architecture / DDD, ESM modules
- **Task Routing Types**: `domain-logic`, `use-cases`, `architecture-scaffolding`, `backend-refactoring`
- **Tool Permissions Required**: Filesystem: read (src/domain/**, src/application/**, src/infrastructure/**), write (src/domain/**, src/application/**, src/infrastructure/**); Process commands: node, npm
- **Verification Standard**: Domain invariant unit tests; dependency rule boundary checks (no outer-layer leakage).
- **Agency Source Provenance**: [`engineering-backend-architect.md`](file:///imports/agency-agents/engineering/engineering-backend-architect.md), [`engineering-software-architect.md`](file:///imports/agency-agents/engineering/engineering-software-architect.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: API Platform & Contract Engineer — *API Gateway & Contract Integration Engineer*
- **Primary Responsibility**: REST and GraphQL endpoint contracts, request schema validation, versioning, and rate limiting.
- **Secondary Skills**: OpenAPI specs, HTTP caching headers, Idempotency key enforcement
- **Technologies Covered**: OpenAPI 3.1, JSON Schema, HTTP/2, REST/GraphQL
- **Task Routing Types**: `api-contract`, `schema-validation`, `endpoint-versioning`, `rate-limiting`
- **Tool Permissions Required**: Filesystem: read (src/api/**, docs/api/**, schemas/**), write (src/api/**, docs/api/**, schemas/**); Process commands: node, npm
- **Verification Standard**: Contract validation tests (e.g. Prism/Supertest); schema regression checks against previous versions.
- **Agency Source Provenance**: [`engineering-api-platform-engineer.md`](file:///imports/agency-agents/engineering/engineering-api-platform-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Real-Time & Event Stream Engineer — *Real-Time Collaboration & Event Message Engineer*
- **Primary Responsibility**: WebSockets, Server-Sent Events, distributed pub/sub event buses, and conflict resolution.
- **Secondary Skills**: Heartbeat monitoring, Connection reconnection logic, Presence tracking
- **Technologies Covered**: WebSockets (ws), SSE, EventBus, CRDT concepts
- **Task Routing Types**: `websocket-handling`, `event-streaming`, `presence-sync`, `message-ordering`
- **Tool Permissions Required**: Filesystem: read (src/infrastructure/**, src/application/**), write (src/infrastructure/**, src/application/**); Process commands: node
- **Verification Standard**: Concurrent connection stress test; message ordering and delivery guarantee tests.
- **Agency Source Provenance**: [`engineering-realtime-collaboration-engineer.md`](file:///imports/agency-agents/engineering/engineering-realtime-collaboration-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Integration & Payments Engineer — *External Services & Billing Integration Specialist*
- **Primary Responsibility**: Payment provider integration, webhook signature validation, idempotency, and transactional ledger.
- **Secondary Skills**: Retry backoff strategy, External failure recovery, Invoice data models
- **Technologies Covered**: Stripe API / Webhooks, Idempotency keys, HMAC SHA256
- **Task Routing Types**: `webhook-handling`, `payment-integration`, `billing-lifecycle`, `external-adapter`
- **Tool Permissions Required**: Filesystem: read (src/integrations/**, src/infrastructure/**), write (src/integrations/**, src/infrastructure/**); Process commands: node
- **Verification Standard**: Simulated webhook replay tests; idempotency duplicate submission rejection tests.
- **Agency Source Provenance**: [`engineering-payments-billing-engineer.md`](file:///imports/agency-agents/engineering/engineering-payments-billing-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: UI/UX Department (`ui-ux`)

- **Department Purpose**: Visual design systems, user journey architectures, usability research, and pixel-quality finish gates.
- **Manager Responsibility**: Maintains brand consistency, interaction hierarchy, and user-centered design quality across releases.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Product UI Designer — *Senior UI & Design Systems Specialist*
- **Primary Responsibility**: Design system tokens, typography scales, iconography, responsive component states, and dark mode.
- **Secondary Skills**: Micro-animations, Visual feedback cues, UI consistency reviews
- **Technologies Covered**: CSS Custom Properties, Design Tokens, SVG Optimization
- **Task Routing Types**: `design-system`, `ui-styling`, `theme-tokens`, `visual-hierarchy`
- **Tool Permissions Required**: Filesystem: read (media/**, src/ui/**, styles/**), write (media/**, src/ui/**, styles/**); Process commands: none
- **Verification Standard**: Visual regression snapshots; design token contrast and theme switching verification.
- **Agency Source Provenance**: [`design-ui-designer.md`](file:///imports/agency-agents/design/design-ui-designer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Information & Interaction Architect — *Information Architecture & UX Interaction Architect*
- **Primary Responsibility**: Navigation structures, workflow diagrams, modal vs inline interaction patterns, and cognitive load.
- **Secondary Skills**: Command palette ergonomics, Empty states, Breadcrumbs and hierarchy
- **Technologies Covered**: User flow diagrams, Wireframe specifications, Information Architecture
- **Task Routing Types**: `ia-mapping`, `interaction-wireframes`, `workflow-ergonomics`, `modal-logic`
- **Tool Permissions Required**: Filesystem: read (docs/ux/**, src/ui/**), write (docs/ux/**, src/ui/**); Process commands: none
- **Verification Standard**: Task click-depth audits (<3 clicks for critical paths); cognitive walkthrough rubric evaluation.
- **Agency Source Provenance**: [`design-ux-architect.md`](file:///imports/agency-agents/design/design-ux-architect.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: UX Researcher & Usability Analyst — *UX Research & Usability Feedback Analyst*
- **Primary Responsibility**: Persona-based cognitive walkthroughs, usability friction audits, and user session feedback synthesis.
- **Secondary Skills**: Error message clarity checks, Onboarding friction analysis, Telemetry analysis
- **Technologies Covered**: Heuristic evaluation (Nielsen), User personas, Qualitative feedback clusters
- **Task Routing Types**: `usability-audit`, `persona-walkthrough`, `friction-analysis`, `feedback-synthesis`
- **Tool Permissions Required**: Filesystem: read (docs/research/**, docs/feedback/**), write (docs/research/**, docs/feedback/**); Process commands: none
- **Verification Standard**: Heuristic evaluation scorecard; usability gap recommendations mapped to engineering tasks.
- **Agency Source Provenance**: [`design-ux-researcher.md`](file:///imports/agency-agents/design/design-ux-researcher.md), [`design-persona-walkthrough.md`](file:///imports/agency-agents/design/design-persona-walkthrough.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 4 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: UI Finish & Visual Quality Reviewer — *UI Polish & Visual Quality Gate Reviewer*
- **Primary Responsibility**: Pre-merge pixel alignment checks, typography line-heights, focus outline states, and border radius consistency.
- **Secondary Skills**: Responsive wrapping tests, Ellipsis truncation review, Animation jitter audit
- **Technologies Covered**: Visual inspection checklists, CSS linting, DOM inspector tooling
- **Task Routing Types**: `visual-quality-gate`, `ui-polish-review`, `truncation-check`, `focus-outline-audit`
- **Tool Permissions Required**: Filesystem: read (src/**, media/**, styles/**), write (src/**, styles/**); Process commands: none
- **Verification Standard**: UI gate checklist signoff; zero horizontal overflow in narrow panels (Phase 440 adherence).
- **Agency Source Provenance**: [`design-ui-finish-gate-reviewer.md`](file:///imports/agency-agents/design/design-ui-finish-gate-reviewer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: QA Testing Department (`qa-testing`)

- **Department Purpose**: Automated testing frameworks, API contract validation, failure analysis, and verifiable evidence collection.
- **Manager Responsibility**: Enforces zero regression gates, test coverage thresholds, and immutable test evidence artifacts.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Test Automation Lead — *Senior Test Automation & E2E Harness Architect*
- **Primary Responsibility**: Unit and integration test suites, mock providers, deterministic fixtures, and test suite speed.
- **Secondary Skills**: Snapshot testing, Extension Host test runner, Test isolation
- **Technologies Covered**: Vitest, Node.js test runner, VS Code Test Electron
- **Task Routing Types**: `test-suite-creation`, `integration-tests`, `fixture-setup`, `mock-providers`
- **Tool Permissions Required**: Filesystem: read (tests/**, src/**, package.json), write (tests/**, test/**); Process commands: npm, node
- **Verification Standard**: Full test suite execution pass with zero skips/errors; deterministic runtime under 60 seconds.
- **Agency Source Provenance**: [`testing-test-automation-engineer.md`](file:///imports/agency-agents/testing/testing-test-automation-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: API & Contract Testing Specialist — *API Regression & Contract Testing Specialist*
- **Primary Responsibility**: HTTP endpoint regression testing, JSON Schema contract verification, and fuzz testing.
- **Secondary Skills**: Edge case boundary values, Error code verification, Payload size limit tests
- **Technologies Covered**: API Test harnesses, Supertest, JSON Schema validators
- **Task Routing Types**: `api-testing`, `contract-verification`, `fuzz-testing`, `boundary-testing`
- **Tool Permissions Required**: Filesystem: read (tests/api/**, src/api/**), write (tests/api/**); Process commands: npm, node
- **Verification Standard**: 100% endpoint status code coverage; invalid payload 4xx rejection verification.
- **Agency Source Provenance**: [`testing-api-tester.md`](file:///imports/agency-agents/testing/testing-api-tester.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Failure Diagnostics & Flake Analyst — *Test Diagnostics & Flaky Test Elimination Specialist*
- **Primary Responsibility**: Test failure pattern analysis, race condition triage, flaky test isolation, and root cause classification.
- **Secondary Skills**: Asynchronous timer cleanup, Mock reset auditing, Assertion error clarification
- **Technologies Covered**: Test logs inspection, Debuggers, Vitest reporter outputs
- **Task Routing Types**: `flake-triaging`, `failure-analysis`, `race-condition-fix`, `test-stabilization`
- **Tool Permissions Required**: Filesystem: read (tests/**, src/**, *.log), write (tests/**); Process commands: npm, node
- **Verification Standard**: Flake-free pass over 50 consecutive test runs in parallel execution mode.
- **Agency Source Provenance**: [`testing-test-results-analyzer.md`](file:///imports/agency-agents/testing/testing-test-results-analyzer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Evidence & Reality Verification Specialist — *Task Result Evidence & Reality Verification Specialist*
- **Primary Responsibility**: Test evidence bundle generation, stdout/stderr capture, artifact hashing, and reality-check validation.
- **Secondary Skills**: Pre-flight vs post-flight state diffing, Proof of execution, Secret redaction in evidence
- **Technologies Covered**: HEADROOM Evidence Bundle, SHA-256 artifact hashing, RedactSecrets
- **Task Routing Types**: `evidence-bundling`, `reality-verification`, `artifact-hashing`, `result-proof`
- **Tool Permissions Required**: Filesystem: read (tests/**, src/**, out/**), write (test-results/**, evidence/**); Process commands: none
- **Verification Standard**: Immutable, non-AI verifiable evidence packets; SHA-256 match between claims and outputs.
- **Agency Source Provenance**: [`testing-evidence-collector.md`](file:///imports/agency-agents/testing/testing-evidence-collector.md), [`testing-reality-checker.md`](file:///imports/agency-agents/testing/testing-reality-checker.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Security Department (`security`)

- **Department Purpose**: Application security boundaries, AI-generated code auditing, secret management, and threat modeling.
- **Manager Responsibility**: Enforces defense-in-depth, zero-hardcode credential policy, and strict permission gating.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Application Security (AppSec) Engineer — *Application Security & Vulnerability Remediation Engineer*
- **Primary Responsibility**: OWASP Top 10 remediation, input sanitization, path traversal defenses, and command injection blockers.
- **Secondary Skills**: Content Security Policy (CSP), CORS configuration, Security headers
- **Technologies Covered**: OWASP Top 10, SAST tooling, Path normalization rules
- **Task Routing Types**: `appsec-review`, `injection-prevention`, `path-traversal-defense`, `sanitization`
- **Tool Permissions Required**: Filesystem: read (src/**, package.json), write (src/**); Process commands: none
- **Verification Standard**: Automated SAST scan pass; negative exploit test cases (injection payloads return rejected/denied).
- **Agency Source Provenance**: [`security-appsec-engineer.md`](file:///imports/agency-agents/security/security-appsec-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: AI Code Security Auditor — *AI-Generated Code Security Auditor*
- **Primary Responsibility**: Specialized auditing of AI-generated code for security hallucinations, phantom packages, and backdoors.
- **Secondary Skills**: Overly permissive scopes audit, Insecure default settings, Mock-leakage checks
- **Technologies Covered**: Static analysis, Dependency manifest cross-reference, AST parsing
- **Task Routing Types**: `ai-code-audit`, `phantom-package-check`, `hallucination-defense`, `ast-audit`
- **Tool Permissions Required**: Filesystem: read (src/**, package.json, package-lock.json), write (none); Process commands: none
- **Verification Standard**: Audit report with zero unvetted third-party package imports and verified call boundaries.
- **Agency Source Provenance**: [`security-ai-generated-code-auditor.md`](file:///imports/agency-agents/security/security-ai-generated-code-auditor.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Secrets & Credential Protection Specialist — *Secret Storage & Credential Boundary Specialist*
- **Primary Responsibility**: Secrets scanning, prevention of hardcoded tokens/keys, and VS Code SecretStorage adapter integrity.
- **Secondary Skills**: Secret redaction in logs/events, Credential rotation flows, Token lifetime limits
- **Technologies Covered**: SecretStorage API, Entropy scanners, Secret regex matchers
- **Task Routing Types**: `secret-scan`, `credential-adapter`, `redaction-verification`, `auth-vault`
- **Tool Permissions Required**: Filesystem: read (src/**, *.json, *.md), write (src/infrastructure/**, src/shared/**); Process commands: none
- **Verification Standard**: Zero hardcoded high-entropy tokens across codebase; SecretStorage integration tests pass.
- **Agency Source Provenance**: [`security-secrets-credential-engineer.md`](file:///imports/agency-agents/security/security-secrets-credential-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Threat Modeling & Pen Testing Lead — *Threat Modeling & Security Boundary Validator*
- **Primary Responsibility**: STRIDE threat modeling, defensive boundary validation, and simulated privilege escalation testing.
- **Secondary Skills**: Role boundary verification, Event bus isolation, Untrusted input fuzzing
- **Technologies Covered**: STRIDE methodology, Attack tree analysis, Pen-testing harnesses
- **Task Routing Types**: `threat-modeling`, `boundary-validation`, `privilege-escalation-test`
- **Tool Permissions Required**: Filesystem: read (src/**, docs/security/**), write (docs/security/**, tests/security/**); Process commands: node
- **Verification Standard**: Threat model document signoff; adversarial penetration test cases confirm boundary enforcement.
- **Agency Source Provenance**: [`security-architect.md`](file:///imports/agency-agents/security/security-architect.md), [`security-penetration-tester.md`](file:///imports/agency-agents/security/security-penetration-tester.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: DevOps Department (`devops`)

- **Department Purpose**: CI/CD automation, Git workflow governance, site reliability engineering, and cloud platforms.
- **Manager Responsibility**: Maintains pipeline execution speed, release gate reliability, and production environment health.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: CI/CD Pipeline Automator — *Continuous Integration & Deployment Specialist*
- **Primary Responsibility**: GitHub Actions workflow authoring, multi-platform matrix builds, and automated artifact packaging.
- **Secondary Skills**: Cache optimization in CI, Action step timeout tuning, Job dependency graphs
- **Technologies Covered**: GitHub Actions, Matrix builds (Windows/Linux/macOS), npm scripts
- **Task Routing Types**: `ci-pipeline`, `matrix-builds`, `action-optimization`, `release-workflow`
- **Tool Permissions Required**: Filesystem: read (.github/workflows/**, package.json), write (.github/workflows/**, package.json); Process commands: none
- **Verification Standard**: Clean CI runs across Windows, Ubuntu, and macOS runners with zero step timeouts.
- **Agency Source Provenance**: [`engineering-devops-automator.md`](file:///imports/agency-agents/engineering/engineering-devops-automator.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Git Workflow & Branch Governance Specialist — *Git Branching & Release Hygiene Specialist*
- **Primary Responsibility**: Conventional commit enforcement, branching models, clean PR rebasing, and tag releases.
- **Secondary Skills**: Merge conflict resolution rules, Release changelog automation, Git hooks
- **Technologies Covered**: Git CLI, Conventional Commits, SemVer 2.0.0
- **Task Routing Types**: `git-workflow`, `changelog-automation`, `branch-protection`, `release-tagging`
- **Tool Permissions Required**: Filesystem: read (CHANGELOG.md, package.json), write (CHANGELOG.md, package.json); Process commands: git
- **Verification Standard**: git diff --check returns 0; commit history conforms to conventional commit specification.
- **Agency Source Provenance**: [`engineering-git-workflow-master.md`](file:///imports/agency-agents/engineering/engineering-git-workflow-master.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Site Reliability Engineer (SRE) — *Service Reliability & Telemetry Monitoring Specialist*
- **Primary Responsibility**: SLO/SLA definitions, error budget tracking, health check endpoints, and incident recovery runbooks.
- **Secondary Skills**: Structured telemetry logging, Alert threshold calibration, Postmortem authoring
- **Technologies Covered**: Telemetry metrics, Health check probes, Incident runbooks
- **Task Routing Types**: `sre-runbooks`, `health-probes`, `telemetry-logging`, `postmortem-analysis`
- **Tool Permissions Required**: Filesystem: read (src/**, docs/runbooks/**), write (src/**, docs/runbooks/**); Process commands: none
- **Verification Standard**: Health probe endpoint test; incident runbook simulation walk-through passes without human intervention.
- **Agency Source Provenance**: [`engineering-sre.md`](file:///imports/agency-agents/engineering/engineering-sre.md), [`support-infrastructure-maintainer.md`](file:///imports/agency-agents/support/support-infrastructure-maintainer.md), [`engineering-incident-response-commander.md`](file:///imports/agency-agents/engineering/engineering-incident-response-commander.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Cloud & Infrastructure Platform Engineer — *Cloud Infrastructure & Containerization Specialist*
- **Primary Responsibility**: Infrastructure-as-code, cloud IAM boundaries, container definitions, and serverless runtime setup.
- **Secondary Skills**: Resource cost tagging, Zero-downtime rolling updates, Network security groups
- **Technologies Covered**: Docker / Containerfiles, Terraform / CloudFormation, AWS / GCP / Azure IAM
- **Task Routing Types**: `cloud-infra`, `containerization`, `iac-configuration`, `security-groups`
- **Tool Permissions Required**: Filesystem: read (infra/**, Dockerfile, package.json), write (infra/**, Dockerfile); Process commands: none
- **Verification Standard**: Container image build succeeds with non-root user execution; IaC syntax check passes.
- **Agency Source Provenance**: [`engineering-platform-engineer.md`](file:///imports/agency-agents/engineering/engineering-platform-engineer.md), [`security-cloud-security-architect.md`](file:///imports/agency-agents/security/security-cloud-security-architect.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Database Department (`database`)

- **Department Purpose**: Relational persistence, query optimization, migration integrity, and semantic data indexing.
- **Manager Responsibility**: Guarantees schema migration idempotency, database ACID consistency, and index efficiency.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Data Systems & Schema Engineer — *Relational Schema Modeling & Migration Specialist*
- **Primary Responsibility**: Database schema design, foreign key constraints, migration scripts, and backward compatibility.
- **Secondary Skills**: Data seeding, Schema introspection, Type mapping between DB and application
- **Technologies Covered**: SQLite (better-sqlite3), SQL DDL, Migration managers
- **Task Routing Types**: `schema-migration`, `table-modeling`, `foreign-keys`, `data-seeding`
- **Tool Permissions Required**: Filesystem: read (src/storage/**, scripts/**), write (src/storage/**); Process commands: node, npm
- **Verification Standard**: Sequential migration execution passes from v1 to latest schema; migration rollback verified.
- **Agency Source Provenance**: [`engineering-data-engineer.md`](file:///imports/agency-agents/engineering/engineering-data-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Database Query Optimizer — *SQL Performance Tuning & Index Strategy Engineer*
- **Primary Responsibility**: Query execution plan analysis (EXPLAIN QUERY PLAN), index design (composite/covering), and slow query elimination.
- **Secondary Skills**: PRAGMA tuning, WAL mode optimization, Lock contention reduction
- **Technologies Covered**: SQLite Query Optimizer, EXPLAIN QUERY PLAN, B-tree indexing
- **Task Routing Types**: `query-optimization`, `index-creation`, `explain-query-plan`, `wal-tuning`
- **Tool Permissions Required**: Filesystem: read (src/storage/**, benchmarks/**), write (src/storage/**, benchmarks/**); Process commands: node
- **Verification Standard**: Query plan confirms SEARCH TABLE USING INDEX for all high-frequency lookups (zero full table scans).
- **Agency Source Provenance**: [`engineering-database-optimizer.md`](file:///imports/agency-agents/engineering/engineering-database-optimizer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Database Reliability & Recovery Specialist — *Database Resilience, Backup & Integrity Specialist*
- **Primary Responsibility**: Database file integrity checks (PRAGMA integrity_check), online backup procedures, and recovery verification.
- **Secondary Skills**: Crash consistency testing, Corrupt database recovery, Storage compaction (VACUUM)
- **Technologies Covered**: SQLite Backup API, PRAGMA integrity_check, Atomic transactions
- **Task Routing Types**: `db-backup`, `integrity-check`, `crash-recovery`, `vacuum-maintenance`
- **Tool Permissions Required**: Filesystem: read (src/storage/**, scripts/check-sqlite.js), write (src/storage/**, scripts/check-sqlite.js); Process commands: node
- **Verification Standard**: npm run check:sqlite exits 0; backup snapshot restore restores 100% of persisted rows.
- **Agency Source Provenance**: [`engineering-database-reliability-engineer.md`](file:///imports/agency-agents/engineering/engineering-database-reliability-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Data Retrieval & Semantic Search Engineer — *Full-Text Search & Semantic Retrieval Specialist*
- **Primary Responsibility**: SQLite FTS5 full-text indexing, BM25 scoring, vector embedding stores, and semantic chunking.
- **Secondary Skills**: Query tokenization, Fuzzy search fallbacks, Re-ranking pipelines
- **Technologies Covered**: SQLite FTS5, Vector embeddings, BM25 ranking, RAG pipelines
- **Task Routing Types**: `fts-indexing`, `semantic-search`, `bm25-tuning`, `vector-retrieval`
- **Tool Permissions Required**: Filesystem: read (src/storage/**, src/domain/memoryRetrieval.js), write (src/storage/**, src/domain/memoryRetrieval.js); Process commands: node
- **Verification Standard**: Search benchmark tests verify recall@10 and precision metrics; query latency <10ms for 100k records.
- **Agency Source Provenance**: [`engineering-search-relevance-engineer.md`](file:///imports/agency-agents/engineering/engineering-search-relevance-engineer.md), [`engineering-rag-pipeline-engineer.md`](file:///imports/agency-agents/engineering/engineering-rag-pipeline-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Performance Department (`performance`)

- **Department Purpose**: Runtime speed, latency minimization, memory profiling, and surgical minimal-change diffing.
- **Manager Responsibility**: Maintains application responsiveness budgets, benchmarks regressions, and guards code diff size.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Autonomous Optimization Architect — *Autonomous Profiling & Bottleneck Optimization Architect*
- **Primary Responsibility**: Automated CPU flamegraphs, event loop delay monitoring, memory heap analysis, and bottleneck detection.
- **Secondary Skills**: Algorithmic complexity reduction, Micro-benchmark design, Garbage collection tuning
- **Technologies Covered**: V8 Profiler, Node.js perf_hooks, Flamegraphs
- **Task Routing Types**: `cpu-profiling`, `event-loop-tuning`, `heap-analysis`, `bottleneck-removal`
- **Tool Permissions Required**: Filesystem: read (src/**, benchmarks/**), write (src/**, benchmarks/**); Process commands: node
- **Verification Standard**: Benchmark execution confirms >20% throughput improvement with zero degradation under load.
- **Agency Source Provenance**: [`engineering-autonomous-optimization-architect.md`](file:///imports/agency-agents/engineering/engineering-autonomous-optimization-architect.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Performance Benchmarking Specialist — *Continuous Performance Benchmarking Specialist*
- **Primary Responsibility**: Regression benchmarking harnesses, latency percentile tracking (p50/p95/p99), and throughput stress tests.
- **Secondary Skills**: Load generator scripts, Benchmark report generation, Hardware baseline calibration
- **Technologies Covered**: vitest.benchmark.config.js, Tinybench, Autocannon
- **Task Routing Types**: `benchmark-authoring`, `latency-testing`, `throughput-stress`, `regression-gate`
- **Tool Permissions Required**: Filesystem: read (benchmarks/**, src/**), write (benchmarks/**); Process commands: npm, node
- **Verification Standard**: npm run benchmark execution passes within defined variance thresholds; no regression alerts.
- **Agency Source Provenance**: [`testing-performance-benchmarker.md`](file:///imports/agency-agents/testing/testing-performance-benchmarker.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Minimal-Change Remediation Specialist — *Surgical Patching & Minimal-Diff Remediation Specialist*
- **Primary Responsibility**: Surgical bug fixes, zero-side-effect refactoring, and minimal git diff footprint.
- **Secondary Skills**: Preserve untouched line formatting, Targeted test creation, Collateral damage prevention
- **Technologies Covered**: Git diff --stat, AST-aware patching, Surgical unit testing
- **Task Routing Types**: `surgical-bugfix`, `minimal-diff-patch`, `targeted-hotfix`, `regression-avoidance`
- **Tool Permissions Required**: Filesystem: read (src/**, tests/**), write (src/**, tests/**); Process commands: none
- **Verification Standard**: git diff --stat verifies fewest lines touched to resolve issue; 100% test pass on touched modules.
- **Agency Source Provenance**: [`engineering-minimal-change-engineer.md`](file:///imports/agency-agents/engineering/engineering-minimal-change-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Data Visualization & Telemetry Engineer — *Performance Telemetry & Data Visualization Engineer*
- **Primary Responsibility**: Interactive performance dashboards, charts, real-time activity feeds, and metric visualization.
- **Secondary Skills**: Canvas/SVG graph rendering, Time-series data aggregation, Status indicator widgets
- **Technologies Covered**: Canvas API, SVG Charts, Webview Telemetry feeds
- **Task Routing Types**: `dashboard-widgets`, `metric-visualization`, `activity-feed`, `time-series-charts`
- **Tool Permissions Required**: Filesystem: read (src/ui/**, media/**), write (src/ui/**, media/**); Process commands: none
- **Verification Standard**: Webview telemetry chart renders at 60fps with 10k data points; memory remains bounded.
- **Agency Source Provenance**: [`engineering-data-visualization-engineer.md`](file:///imports/agency-agents/engineering/engineering-data-visualization-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

## OFFICE: APP DEVELOPMENT (`app-development`)

*Desktop, mobile, native runtime integration, app backend services, and multi-platform app store release engineering.*

### Department: Desktop Applications (`desktop-apps`)

- **Department Purpose**: Desktop client architecture, native OS windowing, IPC mechanisms, and desktop packaging.
- **Manager Responsibility**: Maintains desktop window responsiveness, multi-process memory isolation, and native OS compliance.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Desktop Client Architect — *Desktop Application & Window Lifecycle Architect*
- **Primary Responsibility**: Desktop app architecture (Electron / Tauri / VS Code Extension), main/renderer process separation.
- **Secondary Skills**: Native menus, Tray notifications, Keyboard shortcut managers
- **Technologies Covered**: Electron, Tauri, VS Code Extension Host, IPC protocols
- **Task Routing Types**: `desktop-architecture`, `ipc-messaging`, `window-management`, `menu-lifecycle`
- **Tool Permissions Required**: Filesystem: read (src/**, package.json), write (src/**); Process commands: node, npm
- **Verification Standard**: Extension Host / Electron clean activation; process memory boundary tests pass.
- **Agency Source Provenance**: [`engineering-desktop-app-engineer.md`](file:///imports/agency-agents/engineering/engineering-desktop-app-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Native Interop & OS Integration Specialist — *Native OS Bindings & Systems Interop Engineer*
- **Primary Responsibility**: Native C++/Rust node addons, native file system watchers, OS keychain integration, and low-level syscalls.
- **Secondary Skills**: Node-API (N-API), Native binary prebuilds, Cross-compilation
- **Technologies Covered**: Node-API (N-API), better-sqlite3 / bindings, Rust FFI
- **Task Routing Types**: `native-addons`, `os-bindings`, `node-gyp-build`, `keychain-access`
- **Tool Permissions Required**: Filesystem: read (src/**, node_modules/**, binding.gyp), write (src/**, binding.gyp); Process commands: node, npm
- **Verification Standard**: Native module compiles cleanly on Windows x64, macOS arm64, and Linux x64.
- **Agency Source Provenance**: [`engineering-desktop-app-engineer.md`](file:///imports/agency-agents/engineering/engineering-desktop-app-engineer.md), [`engineering-rust-refactoring-specialist.md`](file:///imports/agency-agents/engineering/engineering-rust-refactoring-specialist.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 3: Desktop Performance & Resource Optimizer — *Desktop Runtime Resource & Memory Specialist*
- **Primary Responsibility**: Renderer process memory limits, background process throttling, and idle battery power consumption.
- **Secondary Skills**: V8 heap snapshots, Zombie process termination, Fast launch cold-start tuning
- **Technologies Covered**: V8 Memory Snapshots, Process CPU monitoring, Cold start profilers
- **Task Routing Types**: `desktop-memory-tuning`, `cold-start-optimization`, `process-throttling`
- **Tool Permissions Required**: Filesystem: read (src/**, benchmarks/**), write (benchmarks/**); Process commands: node
- **Verification Standard**: Cold-start launch <800ms; idle resident memory remains under 120MB threshold.
- **Agency Source Provenance**: [`engineering-autonomous-optimization-architect.md`](file:///imports/agency-agents/engineering/engineering-autonomous-optimization-architect.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Desktop Packaging & Auto-Update Engineer — *Desktop Packaging, Code Signing & Distribution Specialist*
- **Primary Responsibility**: Installer packaging (VSIX / MSI / DMG / AppImage), code signing certificates, and auto-update feeds.
- **Secondary Skills**: Delta package updates, Notarization (Apple/Microsoft), Release channel feeds
- **Technologies Covered**: @vscode/vsce, electron-builder, SignTool / codesign
- **Task Routing Types**: `vsix-packaging`, `code-signing`, `auto-update-setup`, `installer-bundle`
- **Tool Permissions Required**: Filesystem: read (out/**, package.json, README.md, LICENSE), write (*.vsix, dist/**); Process commands: node, npm
- **Verification Standard**: Package validation passes with zero vsce warnings; test install and activation succeeds.
- **Agency Source Provenance**: [`engineering-developer-tooling-engineer.md`](file:///imports/agency-agents/engineering/engineering-developer-tooling-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Mobile Applications (`mobile-apps`)

- **Department Purpose**: Mobile cross-platform architecture, mobile touch ergonomics, offline synchronization, and app store release.
- **Manager Responsibility**: Oversees mobile battery efficiency, offline data consistency, and app store review guidelines.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Mobile Application Architect — *Cross-Platform Mobile Application Architect*
- **Primary Responsibility**: Cross-platform mobile architecture (React Native / Flutter), navigation stacks, and bridge lifecycle.
- **Secondary Skills**: Native module bridges, Deep linking schemes, State persistence across backgrounding
- **Technologies Covered**: React Native, Flutter, TypeScript/JS, Native Android/iOS bridges
- **Task Routing Types**: `mobile-architecture`, `navigation-stacks`, `deep-linking`, `lifecycle-state`
- **Tool Permissions Required**: Filesystem: read (src/**, android/**, ios/**), write (src/**); Process commands: npm, node
- **Verification Standard**: App launches and handles background/foreground transitions without state drop.
- **Agency Source Provenance**: [`engineering-mobile-app-builder.md`](file:///imports/agency-agents/engineering/engineering-mobile-app-builder.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Mobile Touch UI & Gesture Specialist — *Mobile Touch Interaction & Animation Specialist*
- **Primary Responsibility**: Touch ergonomics, momentum scrolling, gesture recognition, and responsive mobile layouts.
- **Secondary Skills**: Haptic feedback triggers, Keyboard avoidance, Bottom sheet interactions
- **Technologies Covered**: Mobile gesture handlers, Reanimated / Animation APIs, Haptic APIs
- **Task Routing Types**: `mobile-gestures`, `touch-layout`, `haptics-setup`, `keyboard-avoidance`
- **Tool Permissions Required**: Filesystem: read (src/ui/**, src/screens/**), write (src/ui/**, src/screens/**); Process commands: none
- **Verification Standard**: 60fps animation frame rate audit during swipe/gesture drag transitions.
- **Agency Source Provenance**: [`design-ui-designer.md`](file:///imports/agency-agents/design/design-ui-designer.md), [`engineering-mobile-app-builder.md`](file:///imports/agency-agents/engineering/engineering-mobile-app-builder.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Mobile Offline Sync & Local Cache Specialist — *Mobile Offline Caching & Sync Protocol Engineer*
- **Primary Responsibility**: On-device SQLite caching, offline-first mutations, conflict resolution, and background sync queues.
- **Secondary Skills**: Network change listeners, Optimistic UI updates, Storage quota management
- **Technologies Covered**: SQLite Mobile / WatermelonDB, Background Fetch, Conflict Resolution Rules
- **Task Routing Types**: `offline-sync`, `local-cache`, `mutation-queue`, `conflict-resolution`
- **Tool Permissions Required**: Filesystem: read (src/storage/**, src/sync/**), write (src/storage/**, src/sync/**); Process commands: node
- **Verification Standard**: Offline mutation queue replay test; zero data loss after simulated network drops.
- **Agency Source Provenance**: [`engineering-database-reliability-engineer.md`](file:///imports/agency-agents/engineering/engineering-database-reliability-engineer.md), [`engineering-realtime-collaboration-engineer.md`](file:///imports/agency-agents/engineering/engineering-realtime-collaboration-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Mobile Release & Distribution Engineer — *Mobile App Store Release & Track Automation Specialist*
- **Primary Responsibility**: Fastlane deployment pipelines, App Store Connect and Google Play Console release tracks, and signing.
- **Secondary Skills**: Metadata localization, TestFlight / Internal Testing tracks, Crash reporting integration
- **Technologies Covered**: Fastlane, Gradle / Xcodebuild, App Store Connect API
- **Task Routing Types**: `mobile-release`, `app-signing`, `store-metadata`, `fastlane-automation`
- **Tool Permissions Required**: Filesystem: read (fastlane/**, android/**, ios/**), write (fastlane/**); Process commands: fastlane, node
- **Verification Standard**: Automated test build and signed bundle generation; store metadata validation pass.
- **Agency Source Provenance**: [`engineering-mobile-release-engineer.md`](file:///imports/agency-agents/engineering/engineering-mobile-release-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: App Backend & Cloud APIs (`app-backend-cloud`)

- **Department Purpose**: Mobile/desktop backend endpoints, push notifications, authentication, and privacy sandboxing.
- **Manager Responsibility**: Maintains API backwards compatibility across deployed app versions and identity boundaries.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: App Cloud Backend Architect — *Cloud Backend & Mobile API Architect*
- **Primary Responsibility**: Serverless and microservice backend architecture tailored for mobile/desktop client apps.
- **Secondary Skills**: Push notification dispatch (APNs/FCM), Multi-version client routing
- **Technologies Covered**: Node.js, Serverless / Express, APNs / FCM
- **Task Routing Types**: `app-backend`, `push-notifications`, `client-version-routing`
- **Tool Permissions Required**: Filesystem: read (src/backend/**, src/api/**), write (src/backend/**, src/api/**); Process commands: node
- **Verification Standard**: Integration test for multi-version client payload contracts; push payload schema tests.
- **Agency Source Provenance**: [`engineering-backend-architect.md`](file:///imports/agency-agents/engineering/engineering-backend-architect.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: App API Gateway & Protocol Engineer — *Mobile Protocol & High-Efficiency Gateway Engineer*
- **Primary Responsibility**: Compact binary/JSON payload serialization (Protobuf/JSON), delta syncing, and cellular bandwidth economy.
- **Secondary Skills**: Payload compression (Brotli/Gzip), Batch API requests, ETag caching
- **Technologies Covered**: HTTP/3, Protobuf, JSON Schema, ETags
- **Task Routing Types**: `payload-optimization`, `delta-sync-api`, `compression-setup`
- **Tool Permissions Required**: Filesystem: read (src/api/**, schemas/**), write (src/api/**, schemas/**); Process commands: node
- **Verification Standard**: Payload benchmark confirms <5KB transfer for core client sync queries.
- **Agency Source Provenance**: [`engineering-api-platform-engineer.md`](file:///imports/agency-agents/engineering/engineering-api-platform-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Identity & Authentication Specialist — *Mobile/Desktop Authentication & Session Specialist*
- **Primary Responsibility**: OAuth2/OIDC token flows, biometric authentication bridges, refresh token rotation, and device trust.
- **Secondary Skills**: PKCE flow enforcement, Session revocation, Single Sign-On (SSO)
- **Technologies Covered**: OAuth 2.0 with PKCE, JWT / JWE, WebAuthn / Biometrics
- **Task Routing Types**: `auth-pkce`, `token-rotation`, `biometric-auth`, `session-revocation`
- **Tool Permissions Required**: Filesystem: read (src/auth/**), write (src/auth/**); Process commands: node
- **Verification Standard**: PKCE auth exchange verification; expired token refresh and replay attack rejection tests.
- **Agency Source Provenance**: [`engineering-identity-access-engineer.md`](file:///imports/agency-agents/engineering/engineering-identity-access-engineer.md), [`agentic-identity-trust.md`](file:///imports/agency-agents/specialized/agentic-identity-trust.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: App Privacy & Sandbox Engineer — *Application Privacy Controls & Sandbox Compliance Specialist*
- **Primary Responsibility**: Privacy by design, client data minimization, telemetry opt-in controls, and OS sandbox compliance.
- **Secondary Skills**: PII scrubbing in crash reports, App Tracking Transparency (ATT), Export compliance
- **Technologies Covered**: Privacy controls, Data minimization, ATT / Privacy Manifests
- **Task Routing Types**: `privacy-manifest`, `pii-scrubbing`, `telemetry-optout`, `sandbox-compliance`
- **Tool Permissions Required**: Filesystem: read (src/**, PrivacyInfo.xcprivacy), write (src/**, PrivacyInfo.xcprivacy); Process commands: none
- **Verification Standard**: Apple Privacy Manifest linting; automated crash report PII leak regex scan passes clean.
- **Agency Source Provenance**: [`engineering-privacy-engineer.md`](file:///imports/agency-agents/engineering/engineering-privacy-engineer.md), [`data-privacy-officer.md`](file:///imports/agency-agents/specialized/data-privacy-officer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: App Quality & Platform Testing (`app-quality-testing`)

- **Department Purpose**: Cross-platform mobile/desktop test automation, resource profiling, and store guidelines validation.
- **Manager Responsibility**: Maintains platform compliance matrices and verifies zero crashes across simulated devices.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Cross-Platform Test Automation Engineer — *Multi-Platform App Test Automation Specialist*
- **Primary Responsibility**: Automated UI test scripts (Appium/Maestro/Playwright), multi-resolution emulation, and smoke flows.
- **Secondary Skills**: Simulated network throttling, Orientation changes, Dark/light mode testing
- **Technologies Covered**: Playwright, Maestro, Appium, Node.js
- **Task Routing Types**: `app-e2e-testing`, `multi-device-emulation`, `smoke-test-flow`
- **Tool Permissions Required**: Filesystem: read (tests/**, src/**), write (tests/**, test-results/**); Process commands: npm, node
- **Verification Standard**: 100% smoke test pass across simulated phone, tablet, and desktop viewport sizes.
- **Agency Source Provenance**: [`testing-test-automation-engineer.md`](file:///imports/agency-agents/testing/testing-test-automation-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: App Performance & Battery Profiler — *App Battery & Energy Consumption Profiler*
- **Primary Responsibility**: CPU wake lock auditing, background task duration limits, cellular radio wake-ups, and thermal impact.
- **Secondary Skills**: Frame hitch analysis, App launch time tracing, Memory leak checks
- **Technologies Covered**: Android Battery Historian, Xcode Energy Organizer, Systrace
- **Task Routing Types**: `battery-profiling`, `wake-lock-audit`, `energy-optimization`
- **Tool Permissions Required**: Filesystem: read (src/**, benchmarks/**), write (benchmarks/**); Process commands: none
- **Verification Standard**: Zero unnecessary background wake locks; energy impact rating verified at 'Low'.
- **Agency Source Provenance**: [`testing-performance-benchmarker.md`](file:///imports/agency-agents/testing/testing-performance-benchmarker.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: App Store Compliance & DX Specialist — *Store Policy Compliance & Developer Experience Specialist*
- **Primary Responsibility**: App Store / Play Store / Marketplace policy compliance audits, permission explanations, and review guidelines.
- **Secondary Skills**: Onboarding UX walkthroughs, SDK API ergonomics, Rejection risk remediation
- **Technologies Covered**: App Store Review Guidelines, Google Play Policy, Marketplace Policy
- **Task Routing Types**: `store-compliance-audit`, `permission-justification`, `dx-review`
- **Tool Permissions Required**: Filesystem: read (docs/compliance/**, package.json, manifest.json), write (docs/compliance/**); Process commands: none
- **Verification Standard**: Compliance scorecard confirms 100% compliance with current store review rules.
- **Agency Source Provenance**: [`product-dx-engineer.md`](file:///imports/agency-agents/product/product-dx-engineer.md), [`security-compliance-auditor.md`](file:///imports/agency-agents/security/security-compliance-auditor.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 4 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Crash Analytics & Diagnostics Specialist — *Crash Clustering & Runtime Diagnostics Specialist*
- **Primary Responsibility**: Crash stack trace symbolication, crash clustering, ANR (Application Not Responding) triage, and regression test cases.
- **Secondary Skills**: Source map un-minification, Error boundary verification, Crash reproduction scripts
- **Technologies Covered**: Symbolication (dsym/pdb), Source maps, Crash report parsers
- **Task Routing Types**: `crash-triage`, `symbolication`, `anr-investigation`, `crash-regression-test`
- **Tool Permissions Required**: Filesystem: read (src/**, tests/**, crash-reports/**), write (tests/**); Process commands: node
- **Verification Standard**: Every resolved crash has a reproducible automated regression test case that passes.
- **Agency Source Provenance**: [`testing-test-results-analyzer.md`](file:///imports/agency-agents/testing/testing-test-results-analyzer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

## OFFICE: RESEARCH / MAKING (`research-making`)

*Deep technical investigation, rapid spike prototyping, AI systems evaluation, experimental hardware/systems, and technical documentation.*

### Department: Research & Technology Synthesis (`research-synthesis`)

- **Department Purpose**: Academic and technology synthesis, legacy codebase archaeology, and organizational knowledge extraction.
- **Manager Responsibility**: Guides deep technical research and ensures technological choices are grounded in verifiable evidence.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Technical Research Synthesist — *Lead Technical Research & Literature Synthesist*
- **Primary Responsibility**: Distillation of academic papers, technical documentation, library evaluations, and architectural trade-off analysis.
- **Secondary Skills**: Executive research summaries, Comparative matrix tables, Benchmark evaluation
- **Technologies Covered**: Markdown synthesis, Literature review methodologies, Comparative trade-off matrices
- **Task Routing Types**: `research-synthesis`, `tradeoff-analysis`, `library-evaluation`, `technical-brief`
- **Tool Permissions Required**: Filesystem: read (docs/research/**, README.md), write (docs/research/**); Process commands: none
- **Verification Standard**: Evidence-backed research report with citation links and comparative trade-off tables.
- **Agency Source Provenance**: [`research-synthesist.md`](file:///imports/agency-agents/research/research-synthesist.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Codebase Archaeologist & Reverse Engineer — *Legacy Code Archaeology & Reverse Engineering Specialist*
- **Primary Responsibility**: Reverse-engineering undocumented repositories, mapping legacy architecture, and extracting business rules.
- **Secondary Skills**: Dead code detection, Dependency graph extraction, Migration risk assessments
- **Technologies Covered**: AST exploration, Git history archaeology, Static call graphs
- **Task Routing Types**: `codebase-archaeology`, `legacy-extraction`, `reverse-engineering`, `call-graph-mapping`
- **Tool Permissions Required**: Filesystem: read (src/**, legacy/**, package.json), write (docs/architecture/**); Process commands: git, node
- **Verification Standard**: Accurate architecture map and dependency graph verified against current codebase symbols.
- **Agency Source Provenance**: [`specialized-codebase-archaeologist.md`](file:///imports/agency-agents/specialized/specialized-codebase-archaeologist.md), [`engineering-codebase-onboarding-engineer.md`](file:///imports/agency-agents/engineering/engineering-codebase-onboarding-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Technology Trend & Feasibility Analyst — *Technology Feasibility & Evaluation Analyst*
- **Primary Responsibility**: Feasibility evaluations for new frameworks, architectural spikes, and technical risk analysis.
- **Secondary Skills**: Compatibility checks, Vendor lock-in assessment, Migration complexity scoring
- **Technologies Covered**: Technical spike rubrics, Compatibility matrix testing
- **Task Routing Types**: `feasibility-spike`, `technology-evaluation`, `risk-assessment`
- **Tool Permissions Required**: Filesystem: read (docs/research/**, package.json), write (docs/research/**); Process commands: none
- **Verification Standard**: Feasibility spike report with risk matrix and concrete go/no-go recommendation criteria.
- **Agency Source Provenance**: [`product-trend-researcher.md`](file:///imports/agency-agents/product/product-trend-researcher.md), [`testing-tool-evaluator.md`](file:///imports/agency-agents/testing/testing-tool-evaluator.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 4 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Knowledge Graph & Memory Architect — *Organizational Knowledge Graph & Semantic Memory Architect*
- **Primary Responsibility**: Semantic entity extraction, knowledge schema design, decision recall indexing, and organizational memory.
- **Secondary Skills**: Multi-repository data consolidation, Memory decay and curation rules
- **Technologies Covered**: Knowledge graphs, Entity-Relationship modeling, HEADROOM Scoped Memory
- **Task Routing Types**: `knowledge-graph`, `memory-modeling`, `entity-extraction`, `decision-indexing`
- **Tool Permissions Required**: Filesystem: read (src/domain/memory*.js, docs/memory/**), write (src/domain/memory*.js, docs/memory/**); Process commands: none
- **Verification Standard**: Knowledge schema validation; recall query test returns relevant historical decisions accurately.
- **Agency Source Provenance**: [`engineering-knowledge-graph-engineer.md`](file:///imports/agency-agents/engineering/engineering-knowledge-graph-engineer.md), [`data-consolidation-agent.md`](file:///imports/agency-agents/specialized/data-consolidation-agent.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Prototyping & Experimental Development (`prototyping-experimental`)

- **Department Purpose**: Fast POC development, embedded firmware, IoT hardware integration, and low-level safe systems refactoring.
- **Manager Responsibility**: Maintains rapid spike development velocity while ensuring experimental code is isolated from production.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Rapid Software Prototyper — *Fast Proof-of-Concept & Interactive Spike Prototyper*
- **Primary Responsibility**: Fast interactive software prototypes, proof-of-concept implementations, and feasibility validation.
- **Secondary Skills**: Mock datasets, Disposable experimental codebases, Quick demo scaffolding
- **Technologies Covered**: Vanilla JS / Node.js, Quick mock harnesses, Rapid UI scaffolding
- **Task Routing Types**: `rapid-poc`, `experimental-spike`, `feasibility-demo`
- **Tool Permissions Required**: Filesystem: read (src/**, scratch/**), write (scratch/**, experiments/**); Process commands: node, npm
- **Verification Standard**: Working executable prototype demonstration with verified functional smoke test.
- **Agency Source Provenance**: [`engineering-rapid-prototyper.md`](file:///imports/agency-agents/engineering/engineering-rapid-prototyper.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Embedded Systems & Firmware Engineer — *Embedded Microcontroller & Hardware Firmware Specialist*
- **Primary Responsibility**: Bare-metal / RTOS firmware in C/C++, hardware sensor protocols (I2C/SPI/UART), and memory-constrained execution.
- **Secondary Skills**: Power consumption profiling, Hardware debugging via JTAG/SWD, Bootloaders
- **Technologies Covered**: Embedded C/C++, FreeRTOS, I2C / SPI / UART, ARM Cortex-M
- **Task Routing Types**: `firmware-development`, `sensor-driver`, `rtos-tasks`, `hardware-communication`
- **Tool Permissions Required**: Filesystem: read (firmware/**, hardware/**), write (firmware/**); Process commands: make, gcc, clang
- **Verification Standard**: Firmware builds without warnings; static memory allocation analysis shows stack/heap within bounds.
- **Agency Source Provenance**: [`engineering-embedded-firmware-engineer.md`](file:///imports/agency-agents/engineering/engineering-embedded-firmware-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

##### Slot 3: IoT & Connected Devices Specialist — *IoT Device Fleet & Telemetry Protocol Specialist*
- **Primary Responsibility**: IoT device communications (MQTT/CoAP), over-the-air (OTA) updates, and telemetry collection pipelines.
- **Secondary Skills**: Device provisioning, Edge computing data reduction, Connection retry backoff
- **Technologies Covered**: MQTT, CoAP, TLS for IoT, OTA Update Managers
- **Task Routing Types**: `iot-telemetry`, `ota-update`, `mqtt-broker`, `device-provisioning`
- **Tool Permissions Required**: Filesystem: read (iot/**, config/iot/**), write (iot/**); Process commands: node
- **Verification Standard**: MQTT packet delivery verified under simulated 20% packet loss network condition.
- **Agency Source Provenance**: [`engineering-iot-fleet-engineer.md`](file:///imports/agency-agents/engineering/engineering-iot-fleet-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Systems Refactoring & Safety Specialist — *Low-Level Systems Refactoring & Memory Safety Specialist*
- **Primary Responsibility**: Memory safety refactoring, ownership model design, Rust systems components, and concurrency safety.
- **Secondary Skills**: Zero-cost abstractions, Unsafe block auditing, Foreign function interfaces (FFI)
- **Technologies Covered**: Rust, Memory ownership models, Thread safety invariants
- **Task Routing Types**: `systems-refactoring`, `memory-safety-audit`, `rust-integration`, `ffi-bindings`
- **Tool Permissions Required**: Filesystem: read (native/**, src/**), write (native/**); Process commands: cargo, rustc
- **Verification Standard**: cargo test passes; cargo clippy and miri verify zero undefined behavior / memory leaks.
- **Agency Source Provenance**: [`engineering-rust-refactoring-specialist.md`](file:///imports/agency-agents/engineering/engineering-rust-refactoring-specialist.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 4 | Overall Value: 5/5

### Department: AI Systems & Model Evaluation (`ai-systems-evaluation`)

- **Department Purpose**: AI agent prompt engineering, model output evaluation, RAG pipeline tuning, and automation governance.
- **Manager Responsibility**: Guarantees agent safety boundaries, deterministic prompt contracts, and model quality thresholds.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: AI Agent Prompt & Persona Engineer — *Prompt Architecture & Structured Contract Specialist*
- **Primary Responsibility**: Prompt template engineering, few-shot calibration, structured output enforcement, and persona consistency.
- **Secondary Skills**: System prompt token minimization, Context pruning, Chain-of-thought calibration
- **Technologies Covered**: Prompt engineering, JSON Schema structured output, Token optimization
- **Task Routing Types**: `prompt-design`, `structured-output`, `few-shot-tuning`, `persona-calibration`
- **Tool Permissions Required**: Filesystem: read (src/application/promptRegistry.js, prompts/**), write (src/application/promptRegistry.js, prompts/**); Process commands: none
- **Verification Standard**: Structured output validation passes 100/100 test runs; prompt token budget stays within limits.
- **Agency Source Provenance**: [`engineering-prompt-engineer.md`](file:///imports/agency-agents/engineering/engineering-prompt-engineer.md), [`agent-activation-prompts.md`](file:///imports/agency-agents/strategy/coordination/agent-activation-prompts.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Model Quality & Hallucination Evaluator — *AI Model Evaluation & Quality Benchmark Specialist*
- **Primary Responsibility**: Automated model evaluation benchmarks, factual accuracy scoring, hallucination detection, and drift tracking.
- **Secondary Skills**: Eval dataset curation, LLM-as-a-judge rubrics, Toxicity and safety grading
- **Technologies Covered**: Model eval benchmarks, Grading rubrics, Drift detection
- **Task Routing Types**: `model-eval`, `hallucination-scoring`, `accuracy-benchmarking`, `drift-monitoring`
- **Tool Permissions Required**: Filesystem: read (evals/**, tests/**), write (evals/**); Process commands: node
- **Verification Standard**: Automated eval scorecard verifies model output quality meets >95% accuracy rubric.
- **Agency Source Provenance**: [`specialized-model-qa.md`](file:///imports/agency-agents/specialized/specialized-model-qa.md), [`testing-reality-checker.md`](file:///imports/agency-agents/testing/testing-reality-checker.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: RAG & Retrieval Systems Specialist — *Retrieval-Augmented Generation & Vector Chunking Specialist*
- **Primary Responsibility**: Document chunking strategies, embedding distance metrics, hybrid search re-ranking, and retrieval context windows.
- **Secondary Skills**: Context window packing, Citation validation, Stale document eviction
- **Technologies Covered**: Vector retrieval, Chunking algorithms, Cross-encoders, RAG evaluation
- **Task Routing Types**: `rag-tuning`, `chunking-strategy`, `retrieval-ranking`, `context-packing`
- **Tool Permissions Required**: Filesystem: read (src/domain/memory*.js, src/application/context*.js), write (src/domain/memory*.js, src/application/context*.js); Process commands: node
- **Verification Standard**: RAG benchmark verifies Mean Reciprocal Rank (MRR@5) > 0.85; zero context window overflows.
- **Agency Source Provenance**: [`engineering-rag-pipeline-engineer.md`](file:///imports/agency-agents/engineering/engineering-rag-pipeline-engineer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Automation Governance & Ethics Architect — *AI Governance, Safety Boundaries & Human-in-the-Loop Architect*
- **Primary Responsibility**: Agent safety guardrails, human-in-the-loop approval thresholds, permission boundary enforcement, and audit logs.
- **Secondary Skills**: Autonomous action cost caps, Privilege degradation policies, Safety policy documentation
- **Technologies Covered**: Safety policies, Human review gates, AuditLogRepository in HEADROOM
- **Task Routing Types**: `governance-policy`, `safety-guardrails`, `human-approval-gate`, `audit-enforcement`
- **Tool Permissions Required**: Filesystem: read (src/domain/invariants.js, src/domain/planApproval.js), write (src/domain/invariants.js, src/domain/planApproval.js); Process commands: none
- **Verification Standard**: Adversarial simulation verifies prohibited tools and unapproved plans are blocked 100% of the time.
- **Agency Source Provenance**: [`automation-governance-architect.md`](file:///imports/agency-agents/specialized/automation-governance-architect.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

### Department: Technical Documentation & Knowledge Publishing (`documentation-publishing`)

- **Department Purpose**: Developer documentation, Architecture Decision Records (ADRs), multi-format document compilers, and experiment logs.
- **Manager Responsibility**: Maintains documentation completeness, API reference accuracy, and publication artifact integrity.

#### 4-Employee Roster (`EMPLOYEE_SLOTS = 4`):

##### Slot 1: Lead Technical Writer — *Senior Technical Writer & Architecture Documentation Specialist*
- **Primary Responsibility**: Architecture Decision Records (ADRs), engineering guides, API reference docs, and release notes.
- **Secondary Skills**: Code docstrings maintenance, Diagram generation (Mermaid), Styleguide adherence
- **Technologies Covered**: Markdown, Mermaid diagrams, ADR templates, OpenAPI docs
- **Task Routing Types**: `adr-authoring`, `api-documentation`, `architecture-guides`, `release-notes`
- **Tool Permissions Required**: Filesystem: read (docs/**, README.md, RELEASE_POLICY.md), write (docs/**, README.md, RELEASE_POLICY.md); Process commands: none
- **Verification Standard**: Documentation linter passes; all file links and code block syntax verified valid.
- **Agency Source Provenance**: [`engineering-technical-writer.md`](file:///imports/agency-agents/engineering/engineering-technical-writer.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 2: Developer Documentation & DX Specialist — *Developer Experience & Tutorial Authoring Specialist*
- **Primary Responsibility**: Developer onboarding guides, quickstart walkthroughs, code samples, and CLI usage tutorials.
- **Secondary Skills**: Error message remediation documentation, Sample repo maintenance, FAQ curating
- **Technologies Covered**: Quickstart guides, Sample code sandboxes, Developer onboarding
- **Task Routing Types**: `quickstart-authoring`, `developer-guides`, `code-samples`, `faq-curation`
- **Tool Permissions Required**: Filesystem: read (docs/dev/**, examples/**), write (docs/dev/**, examples/**); Process commands: none
- **Verification Standard**: New developer walkthrough test: code sample executes cleanly with zero missing prerequisite errors.
- **Agency Source Provenance**: [`product-dx-engineer.md`](file:///imports/agency-agents/product/product-dx-engineer.md), [`specialized-developer-advocate.md`](file:///imports/agency-agents/specialized/specialized-developer-advocate.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 3: Document Compiler & Publishing Engineer — *Multi-Format Documentation Pipeline Specialist*
- **Primary Responsibility**: Markdown/HTML/PDF compilation pipelines, static documentation site builders, and schema documentation.
- **Secondary Skills**: Automated asset bundling, Dead link checkers, Search indexing for docs
- **Technologies Covered**: Markdown compilers, Static site generators, Link checkers
- **Task Routing Types**: `doc-compilation`, `dead-link-check`, `static-site-build`, `pdf-export`
- **Tool Permissions Required**: Filesystem: read (docs/**, scripts/**), write (docs/build/**); Process commands: node
- **Verification Standard**: Documentation build generates 100% clean output; dead link checker reports 0 broken links.
- **Agency Source Provenance**: [`engineering-universal-document-compiler.md`](file:///imports/agency-agents/engineering/engineering-universal-document-compiler.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

##### Slot 4: Experimental Spike & Results Steward — *Experiment Hypothesis & Evidence Logging Steward*
- **Primary Responsibility**: Structured logging of experimental spikes, hypothesis tracking, metrics collection, and durable handoffs.
- **Secondary Skills**: Durable research handoff notes, Negative result documentation, Experiment archiving
- **Technologies Covered**: Hypothesis logs, Durable handoff schemas, Metric tracking
- **Task Routing Types**: `hypothesis-logging`, `experiment-archiving`, `durable-handoff`, `result-stewarding`
- **Tool Permissions Required**: Filesystem: read (experiments/**, docs/experiments/**), write (docs/experiments/**); Process commands: none
- **Verification Standard**: Hypothesis-evidence pair recorded for every spike; results verified by independent test data.
- **Agency Source Provenance**: [`project-management-experiment-tracker.md`](file:///imports/agency-agents/project-management/project-management-experiment-tracker.md), [`testing-evidence-collector.md`](file:///imports/agency-agents/testing/testing-evidence-collector.md)
- **Evaluation Scores (1-5)**: Coverage: 5 | Duplication: 1 (low=good) | Specialization: 5 | Token Efficiency: 5 | Overall Value: 5/5

## CROSS-OFFICE SHARED SKILLS

To prevent duplicate employee positions across offices, cross-cutting disciplines are modeled as reusable skills:

### `skill:minimal-change-discipline`: Minimal-Change Discipline
- **Description**: Enforces surgical edits, minimal diff footprint, and preservation of untouched lines, comments, and formatting.
- **Applicability**: ALL_EMPLOYEES
- **Source Provenance**: [`engineering-minimal-change-engineer.md`](file:///imports/agency-agents/engineering/engineering-minimal-change-engineer.md)

### `skill:evidence-collection`: Verifiable Evidence Collection
- **Description**: Captures deterministic test outputs, artifact hashes, run proofs, and verification logs without fabricated claims.
- **Applicability**: ALL_EMPLOYEES
- **Source Provenance**: [`testing-evidence-collector.md`](file:///imports/agency-agents/testing/testing-evidence-collector.md)

### `skill:code-review-critique`: Code Review & Defect Detection
- **Description**: Systematic code review for architectural violations, edge-case bugs, security pitfalls, and performance regressions.
- **Applicability**: SENIOR_EMPLOYEES, DEPARTMENT_MANAGERS
- **Source Provenance**: [`engineering-code-reviewer.md`](file:///imports/agency-agents/engineering/engineering-code-reviewer.md)

### `skill:git-pr-workflow`: Git Branch & Conventional PR Workflow
- **Description**: Branch isolation, conventional commit messages, clean rebase standards, and PR hygiene.
- **Applicability**: ALL_EMPLOYEES
- **Source Provenance**: [`engineering-git-workflow-master.md`](file:///imports/agency-agents/engineering/engineering-git-workflow-master.md)

### `skill:technical-documentation`: Technical Documentation Integrity
- **Description**: Accurate markdown documentation, clickable file links, API contract annotations, and ADR recording.
- **Applicability**: ALL_EMPLOYEES
- **Source Provenance**: [`engineering-technical-writer.md`](file:///imports/agency-agents/engineering/engineering-technical-writer.md)

### `skill:secret-redaction-discipline`: Secrets Redaction Discipline
- **Description**: Zero hardcoded credentials, token masking in all logs, events, and task packets, and SecretStorage adherence.
- **Applicability**: ALL_EMPLOYEES
- **Source Provenance**: [`security-secrets-credential-engineer.md`](file:///imports/agency-agents/security/security-secrets-credential-engineer.md)

## MANAGER & ORCHESTRATION ABSORPTIONS

Upstream coordination and orchestrator roles are absorbed into HEADROOM's executive hierarchy:

| Upstream Agency Role | HEADROOM Placement | Architectural Rationale |
| :--- | :--- | :--- |
| `specialized/agents-orchestrator.md` | **AI Director: Objective Decomposition & Office Routing** | Orchestration is an executive function in HEADROOM owned by the AI Director. |
| `specialized/specialized-master-plan-architect.md` | **AI Director: Milestone & Multi-Phase Planning** | Long-horizon roadmap and milestone sequencing belongs to Director-level plan proposals. |
| `specialized/specialized-workflow-architect.md` | **Office Head Manager: Cross-Department Execution Graphs** | Translates director plans into coordinated department dependency schedules. |
| `project-management/project-management-project-shepherd.md` | **Department Manager: Task Queue & Blocker Resolution** | Department managers directly track task progress, handle retries, and escalate blockers. |
| `strategy/coordination/handoff-templates.md` | **Bounded Employee Task Packet & Result Packet Contracts** | Contract structure already formalized in employeeExecutionContract.js. |
| `specialized/specialized-mcp-builder.md` | **HEADROOM Task-Scoped Tools Provider Extension** | MCP server tools should be plugged into TaskScopedTools, not treated as independent agents. |
