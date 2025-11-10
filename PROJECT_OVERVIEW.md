# gemDirect1 - Project Comprehensive Overview

## 🎬 Executive Summary

**gemDirect1** (Cinematic Story Generator) is a sophisticated AI-powered application that transforms story ideas into production-ready cinematic content. Originally developed in Google AI Studio, it now runs locally with full ComfyUI integration for video/image generation.

**Status**: ✅ **Fully Operational Locally**
- Dev Server: http://localhost:3000
- API: Gemini AI (configured)
- Local Generation: Ready for ComfyUI connection

---

## 📋 Table of Contents
1. [Technology Stack](#technology-stack)
2. [Architecture Overview](#architecture-overview)
3. [Core Features](#core-features)
4. [Workflow Pipeline](#workflow-pipeline)
5. [AI Models & Usage](#ai-models--usage)
6. [ComfyUI Integration](#comfyui-integration)
7. [Data Flow](#data-flow)
8. [Key Components](#key-components)
9. [API Interactions](#api-interactions)
10. [Storage & Persistence](#storage--persistence)
11. [Error Handling & Resilience](#error-handling--resilience)
12. [Performance Optimizations](#performance-optimizations)
13. [Security Considerations](#security-considerations)
14. [Future Enhancements](#future-enhancements)

---

## Technology Stack

### Frontend
- **React 19.2.0** - UI framework with latest features
- **TypeScript 5.8.2** - Type safety and developer experience
- **Vite 6.2.0** - Fast development and building
- **Tailwind CSS** (via CDN) - Utility-first styling

### AI & Machine Learning
- **@google/genai 1.28.0** - Gemini API client
  - `gemini-2.5-flash` - Fast text/image generation
  - `gemini-2.5-pro` - Complex reasoning and refinement
  - `gemini-2.5-flash-image` - Image generation

### State Management & Storage
- **React Context API** - API status and usage tracking
- **IndexedDB (idb 8.0.0)** - Local database for projects
- **localStorage** - User preferences and settings

### Utilities
- **marked 16.4.1** - Markdown parsing for rich text
- **Custom hooks** - Persistent state, project data management

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
│  (React Components + Tailwind CSS + Interactive Elements)   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Logic Layer                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Contexts   │  │    Hooks     │  │    Utils     │      │
│  │ (State Mgmt) │  │ (Persistence)│  │  (Helpers)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌───────────────────────────┐  ┌────────────────────────┐
│   Service Layer (APIs)    │  │   Storage Layer (DB)   │
│  ┌────────────────────┐   │  │  ┌──────────────────┐ │
│  │ geminiService.ts   │   │  │  │  IndexedDB (idb) │ │
│  │ (AI interactions)  │   │  │  │  localStorage    │ │
│  └────────────────────┘   │  │  └──────────────────┘ │
│  ┌────────────────────┐   │  └────────────────────────┘
│  │ comfyUIService.ts  │   │
│  │ (Local generation) │   │
│  └────────────────────┘   │
│  ┌────────────────────┐   │
│  │ payloadService.ts  │   │
│  │ (Prompt building)  │   │
│  └────────────────────┘   │
└───────────────────────────┘
                │
    ┌───────────┴────────────┐
    ▼                        ▼
┌─────────────┐      ┌──────────────────┐
│ Gemini API  │      │  ComfyUI Server  │
│  (Cloud)    │      │    (Local)       │
└─────────────┘      └──────────────────┘
```

---

## Core Features

### 1. **Intelligent Story Generation**

#### Story Bible Creation
- **Input**: One-sentence story idea
- **Output**: 
  - Compelling logline
  - Character descriptions (2-3 key characters)
  - World setting and atmosphere
  - Plot outline using appropriate narrative framework

#### Adaptive Narrative Frameworks
The AI automatically selects or adapts from:
- **Three-Act Structure** - Classic setup/confrontation/resolution
- **The Hero's Journey** - Mythic quest pattern (Campbell's monomyth)
- **Seven-Point Story Structure** - Plot-focused approach
- **Save the Cat** - Beat sheet for commercial screenplays
- **Kishōtenketsu** - East Asian four-act structure (intro/develop/twist/conclude)
- **Custom Structures** - For experimental or unique stories

#### Refinement Capabilities
- Character depth enhancement (motivations, conflicts)
- Plot structure strengthening
- Pacing and emotional arc optimization
- Foreshadowing and twist suggestions

### 2. **Director's Vision System**

#### Purpose
Establishes the aesthetic and tonal framework for the entire project.

#### Features
- **AI-Suggested Visions**: 3 distinct cinematic or animation styles
  - Live-action styles: neo-noir, documentary, sci-fi epic
  - Animation styles: Studio Ghibli, Spider-Verse, stop-motion
- **Custom Vision Definition**: Write your own
- **Refinement Tool**: AI enhances visions with specific cinematic terminology
- **Consistency Enforcement**: All subsequent generations respect this vision

#### Example Visions
```
"A gritty, neo-noir aesthetic with high-contrast, low-key lighting 
(chiaroscuro), constant rain, and urban decay. Camera work is mostly 
handheld and claustrophobic. Color palette: desaturated blues, grays, 
and occasional neon accents."

"A whimsical Studio Ghibli-inspired world with lush, painterly 
backgrounds, expressive character animation, and a warm color palette. 
Gentle camera movements that float through the environment. Emphasis on 
natural lighting and the beauty of everyday moments."
```

### 3. **Scene Generation & Timeline Editor**

#### Scene Breakdown
- Analyzes plot outline
- Creates scenes based on:
  - Location changes
  - Time shifts
  - Character objective/conflict changes
- Each scene has:
  - Evocative title
  - One-sentence summary (action + narrative purpose)

#### Shot-by-Shot Timeline
- 3-4 initial shots per scene (AI-generated)
- Manual shot addition/deletion/reordering
- Drag-and-drop organization
- Shot descriptions (vivid, actionable camera instructions)

#### Creative Enhancers (8 categories)
Each shot can have multiple enhancers:

1. **Framing**: Close-Up, Wide Shot, Medium Shot, Over-the-Shoulder, etc.
2. **Movement**: Tracking Shot, Dolly Zoom, Handheld, Crane Shot, etc.
3. **Lens**: Shallow Depth of Field, Fisheye, Anamorphic, Tilt-Shift, etc.
4. **Pacing**: Slow Motion, Fast-Paced Editing, Long Take, etc.
5. **Lighting**: High-Key, Low-Key (Chiaroscuro), Rembrandt, etc.
6. **Mood**: Suspenseful, Dreamlike, Melancholic, Energetic, etc.
7. **VFX**: Film Grain, Lens Flare, Color Grading, Bloom, etc.
8. **Plot Enhancements**: Foreshadowing, Character Development, Twist Setup, etc.

#### Transitions
Between each shot, define transition type:
- Cut (default)
- Fade
- Dissolve
- Wipe
- Match Cut
- Smash Cut

#### Negative Prompts
- Scene-wide negative prompt (AI-suggested)
- Customizable to avoid unwanted elements
- Examples: "blurry, low-res, cartoon, text, watermark, bad anatomy"

### 4. **Co-Director AI Assistant**

#### Purpose
Provides creative suggestions to elevate scenes without breaking the established vision.

#### Capabilities
- **Thematic Concepts**: Creates overarching creative direction for changes
- **Detailed Reasoning**: Explains why each suggestion helps achieve user's goal
- **Diverse Suggestions**: Mix of cinematography, plot, and pacing changes

#### Suggestion Types
1. **UPDATE_SHOT** - Modify existing shot description/enhancers
2. **ADD_SHOT_AFTER** - Insert new shot at specific position
3. **UPDATE_TRANSITION** - Change transition between shots
4. **UPDATE_STORY_BIBLE** - Modify core story elements
5. **UPDATE_DIRECTORS_VISION** - Refine aesthetic guidelines
6. **FLAG_SCENE_FOR_REVIEW** - Mark scenes needing attention

#### User Objectives (Examples)
- "Inject more visual tension and impending dread"
- "Introduce a shocking plot twist"
- "Weave in subtle foreshadowing"
- "Use lighting to create mystery"
- "Heighten emotional vulnerability"

#### Context-Aware Suggestions
Uses pruned context (Cinematographer's Brief) to ensure:
- Respect for narrative structure
- Adherence to Director's Vision
- Synergy with existing shots

### 5. **Batch Processing**

#### Purpose
Efficiently refine multiple shots in a single API call.

#### Features
- **Batch Actions**:
  - `REFINE_DESCRIPTION` - Make shot description more vivid
  - `SUGGEST_ENHANCERS` - Generate creative enhancers
- **Scene Cohesion**: Ensures variety across shots (no repetition)
- **Efficient Token Usage**: Single API call for entire scene

#### Use Case
User has 4 shots that need enhancers. Instead of 4 separate API calls:
```javascript
batchProcessShotEnhancements([
  { shot_id: "1", actions: ["SUGGEST_ENHANCERS"] },
  { shot_id: "2", actions: ["SUGGEST_ENHANCERS"] },
  { shot_id: "3", actions: ["REFINE_DESCRIPTION", "SUGGEST_ENHANCERS"] },
  { shot_id: "4", actions: ["SUGGEST_ENHANCERS"] }
])
```

### 6. **Image Generation**

#### Keyframe Generation (Scene-Level)
- **Purpose**: Visual anchor for the entire scene
- **Input**: Director's Vision + Scene Summary
- **Output**: 8K photorealistic image (16:9 aspect ratio)
- **Style**: Strictly adheres to Director's Vision
- **Model**: `gemini-2.5-flash-image`

#### Shot Preview Generation
- **Purpose**: Visualize specific shot before video generation
- **Input**: 
  - Shot description
  - Creative enhancers
  - Director's Vision
  - Scene context
- **Output**: Cinematic photograph matching all specifications
- **Special Focus**: Accurate lighting implementation (e.g., low-key = dramatic shadows)

### 7. **ComfyUI Integration**

#### Auto-Discovery
Automatically finds ComfyUI server at common addresses:
- `http://127.0.0.1:8188`
- `http://localhost:8188`

#### Workflow Sync
- Fetches active workflow from ComfyUI server
- Parses workflow structure (API format JSON)
- Identifies all input nodes

#### Intelligent Mapping
**Automatic Mapping** (AI-powered):
- Analyzes workflow structure
- Identifies node types (CLIPTextEncode, LoadImage, etc.)
- Suggests optimal data mappings

**Manual Mapping**:
- User can override AI suggestions
- Map any app data to any node input

**Supported Data Types**:
1. **Human-Readable Prompt** - Natural language scene description
2. **Full Timeline JSON** - Structured shot data
3. **Keyframe Image** - Scene establishing image
4. **Negative Prompt** - Things to avoid

#### Pre-flight Checks
Before each generation:
1. ✅ Server Connection - Verify ComfyUI is responsive
2. ✅ System Resources - Check GPU VRAM (warn if < 2GB free)
3. ✅ Queue Status - Show position in queue
4. ✅ Workflow Validity - Ensure mapped nodes exist
5. ✅ Mapping Consistency - Validate data types match node inputs

#### Generation Process
1. **Upload Assets** - Keyframe image to ComfyUI's input folder
2. **Inject Data** - Apply mappings to workflow nodes
3. **Queue Prompt** - Send workflow to ComfyUI
4. **Track Progress** - WebSocket connection for real-time updates
5. **Fetch Result** - Download and display final output

#### Real-time Tracking (WebSocket)
- Queue position updates
- Execution start notification
- Per-node progress (with node titles)
- Progress percentage
- Error handling
- Final output retrieval

### 8. **Video Analysis & Continuity Scoring**

#### Purpose
Evaluate generated videos against creative intent.

#### Analysis Process
1. **Frame Extraction** - Sample frames from video (user-uploaded)
2. **AI Analysis** - Gemini describes visual elements, actions, style
3. **Continuity Scoring** - Compare analysis to original timeline

#### Scoring Dimensions (1-10 scale)
1. **Narrative Coherence** - Does video match scene's plot purpose?
2. **Aesthetic Alignment** - Does style match Director's Vision?
3. **Thematic Resonance** - Does it capture intended mood/emotion?

#### Feedback System
- **Overall Feedback** - Summary of what worked and what didn't
- **Suggested Changes** - Actionable fixes (prioritizes root causes)

#### Change Types
- **Project-Level Fixes** - Update Story Bible or Director's Vision
- **Timeline Fixes** - Modify shots, add new shots, change transitions
- **Scene Flagging** - Mark other scenes that may be affected

#### Use Cases
- Quality assurance before final production
- Iterative refinement workflow
- Identifying systematic issues (e.g., lighting style not working)

### 9. **Timeline Extension (Continuity-Based)**

#### Purpose
Generate new scenes that logically follow from previous scenes.

#### Process
1. User uploads final video of a scene
2. App extracts last frame
3. User provides direction: "What happens next?"
4. AI generates next scene using:
   - Story Bible context
   - Director's Vision
   - Previous scene summary
   - Last frame visual continuity
   - User's direction
5. New scene inserted into timeline

#### Benefits
- Visual continuity (AI sees the last frame)
- Narrative coherence (respects story structure)
- Creative flexibility (user guides the direction)

---

## Workflow Pipeline

### Linear Workflow (5 Stages)

```
1. IDEA
   ↓
   User inputs story concept
   ↓
2. STORY BIBLE
   ↓
   AI generates logline, characters, setting, plot
   User refines (optional)
   ↓
3. DIRECTOR'S VISION
   ↓
   User defines or selects cinematic style
   AI refines (optional)
   ↓
4. DIRECTOR (Timeline Editing)
   ↓
   AI generates scenes with shot lists
   User edits timelines, applies Co-Director suggestions
   Generates keyframes and shot previews
   Optionally generates videos via ComfyUI
   ↓
5. CONTINUITY
   ↓
   Upload generated videos
   AI analyzes and scores
   Apply suggestions or extend timeline
   Repeat until satisfied
```

### Iterative Refinement Loop

At any stage, users can:
- Go back to previous stages
- Refine existing content
- Apply AI suggestions
- Generate new variations

---

## AI Models & Usage

### Model Selection Strategy

| Model | Use Case | Characteristics |
|-------|----------|-----------------|
| **gemini-2.5-pro** | Complex reasoning, story generation, refinement | High quality, slower, more tokens |
| **gemini-2.5-flash** | Fast operations, suggestions, analysis | Fast, cost-effective |
| **gemini-2.5-flash-image** | Image generation | Photorealistic, multi-modal |

### Token Optimization Techniques

#### 1. Context Pruning
Before complex operations, the app creates "briefs":
- **Cinematographer's Brief** (for shot generation)
- **Co-Director's Brief** (for suggestions)
- **Continuity Brief** (for video scoring)

These briefs distill essential information (150-200 words) from full context.

#### 2. Structured Outputs
All API calls use JSON schemas to ensure:
- Predictable output format
- No extraneous text
- Easy parsing

#### 3. Retry Logic with Exponential Backoff
- Handles rate limits gracefully
- 3 retries with increasing delay (1s, 2s, 4s + jitter)
- Automatic retry for 429/quota errors
- Fail fast for other errors

#### 4. Error Handling
Centralized error handler identifies:
- Rate limit errors (retry)
- Quota exceeded (inform user)
- Safety filter triggers (inform user)
- Network errors (check connection)

### Usage Tracking

#### Built-in Dashboard
- Total tokens consumed
- Tokens per model
- Tokens per operation type
- Success/error rates
- Timeline view (when calls were made)

#### API Call Logging
Each call records:
- Timestamp
- Context (operation name)
- Model used
- Token count
- Status (success/error)

---

## ComfyUI Integration

### Connection Architecture

```
App (Browser)
    │
    ├─> HTTP Requests ──> ComfyUI Server :8188
    │   │
    │   ├─> GET /system_stats (health check)
    │   ├─> GET /queue (queue status)
    │   ├─> POST /upload/image (asset upload)
    │   ├─> POST /prompt (queue generation)
    │   └─> GET /view (fetch output)
    │
    └─> WebSocket ──> ComfyUI Server :8188/ws
        │
        └─> Real-time progress updates
```

### Workflow Mapping Deep Dive

#### Example Workflow (Text-to-Image)
```json
{
  "3": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "placeholder positive prompt",
      "clip": ["4", 1]
    },
    "_meta": { "title": "CLIP Text Encode (Positive)" }
  },
  "7": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "placeholder negative prompt",
      "clip": ["4", 1]
    },
    "_meta": { "title": "CLIP Text Encode (Negative)" }
  },
  "10": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "example.png"
    },
    "_meta": { "title": "Load Image" }
  }
}
```

#### Mapping Configuration
```json
{
  "3:text": "human_readable_prompt",
  "7:text": "negative_prompt",
  "10:image": "keyframe_image"
}
```

#### Data Injection (Runtime)
```javascript
// App generates:
const humanReadablePrompt = "SHOT 1: Wide shot of hero...";
const negativePrompt = "blurry, low quality";
const keyframeFilename = "csg_keyframe_123.jpg"; // (uploaded)

// App injects into workflow:
workflow["3"].inputs.text = humanReadablePrompt;
workflow["7"].inputs.text = negativePrompt;
workflow["10"].inputs.image = keyframeFilename;

// Send to ComfyUI:
POST /prompt { prompt: workflow, client_id: "csg_456" }
```

### Supported Workflow Types

1. **Text-to-Image** - Basic Stable Diffusion
2. **Image-to-Image** - Keyframe as input
3. **Image-to-Video** - AnimateDiff, SVD (Stable Video Diffusion)
4. **ControlNet** - Guided generation
5. **Multi-stage** - Upscaling, refinement passes
6. **Custom Nodes** - Any node with text/image inputs

### Progress Tracking States

```
idle → queued → running → complete
                    │
                    └─> error
```

**Queued**: Shows position in queue
**Running**: Shows current node name and % progress
**Complete**: Displays final output (image or video)
**Error**: Shows specific error message

---

## Data Flow

### User Creates Story

```
User Input (idea)
    │
    ▼
geminiService.generateStoryBible()
    │
    ▼
Gemini API (gemini-2.5-pro)
    │
    ▼
JSON Response { logline, characters, setting, plotOutline }
    │
    ▼
setStoryBible(result)
    │
    ▼
State Update → UI Re-render
    │
    ▼
IndexedDB Persistence (via hooks)
```

### Scene Generation with Keyframe

```
User Submits Director's Vision
    │
    ▼
geminiService.generateSceneList()
    │
    ▼
Scenes Created
    │
    ├─> For each scene:
    │   │
    │   ├─> geminiService.generateKeyframeForScene()
    │   │       │
    │   │       ▼
    │   │   Gemini Image API
    │   │       │
    │   │       ▼
    │   │   Base64 Image Data
    │   │
    │   └─> setGeneratedImages({ [sceneId]: base64Image })
    │
    ├─> geminiService.generateAndDetailInitialShots()
    │       │
    │       ▼
    │   Initial 3-4 shots with enhancers
    │
    └─> setScenes([...scenes])
```

### Local Video Generation (ComfyUI)

```
User Clicks "Generate Local Video"
    │
    ▼
Pre-flight Checks (comfyUIService)
    │
    ├─> checkServerConnection()
    ├─> validateWorkflowAndMappings()
    └─> getQueueInfo()
    │
    ▼ (All pass)
payloadService.generatePayloads(scene)
    │
    ▼
{ json, text, structured, negativePrompt }
    │
    ▼
comfyUIService.queueComfyUIPrompt()
    │
    ├─> Upload keyframe image
    │       POST /upload/image
    │           │
    │           ▼
    │       { name: "csg_keyframe_123.jpg" }
    │
    ├─> Clone workflow template
    ├─> Inject data based on mappings
    │
    └─> Queue prompt
            POST /prompt { prompt: injectedWorkflow, client_id }
                │
                ▼
            { prompt_id: "abc-123" }
                │
                ▼
comfyUIService.trackPromptExecution()
    │
    ▼
WebSocket Connection
    │
    ├─> Message: "status" → Update queue position
    ├─> Message: "execution_start" → Set status to "running"
    ├─> Message: "executing" → Update current node name
    ├─> Message: "progress" → Update progress %
    ├─> Message: "executed" → Fetch final output
    │       │
    │       └─> GET /view?filename=output.mp4
    │               │
    │               ▼
    │           Video Blob → Data URL
    │
    └─> setLocalGenStatus({ status: 'complete', final_output: {...} })
```

---

## Key Components

### Services

#### geminiService.ts (1000+ lines)
**Purpose**: All Gemini API interactions

**Key Functions**:
- `generateStoryBible()` - Create story from idea
- `generateSceneList()` - Break plot into scenes
- `generateAndDetailInitialShots()` - Create shot list
- `suggestStoryIdeas()` - AI brainstorming
- `suggestDirectorsVisions()` - Style suggestions
- `refineDirectorsVision()` - Enhance vision with terminology
- `getCoDirectorSuggestions()` - Creative improvements
- `batchProcessShotEnhancements()` - Refine multiple shots
- `generateKeyframeForScene()` - Image generation
- `generateImageForShot()` - Shot preview image
- `analyzeVideoFrames()` - Video analysis
- `scoreContinuity()` - Compare video to intent
- `generateNextSceneFromContinuity()` - Timeline extension
- `withRetry()` - Retry wrapper with backoff
- `getPrunedContext*()` - Context optimization functions

**Features**:
- Exponential backoff retry logic
- Structured JSON outputs
- Context pruning for efficiency
- State change callbacks
- Usage logging

#### comfyUIService.ts (600+ lines)
**Purpose**: ComfyUI integration

**Key Functions**:
- `discoverComfyUIServer()` - Auto-find ComfyUI
- `checkServerConnection()` - Health check
- `checkSystemResources()` - VRAM check
- `getQueueInfo()` - Queue status
- `validateWorkflowAndMappings()` - Pre-flight validation
- `queueComfyUIPrompt()` - Send generation request
- `trackPromptExecution()` - WebSocket tracking

**Features**:
- Pre-flight checks system
- Asset upload (images)
- Data injection based on mappings
- Real-time progress tracking
- Error handling and recovery

#### payloadService.ts
**Purpose**: Generate prompts from timeline data

**Key Functions**:
- `generatePayloads()` - Create all prompt formats
- `generateHumanReadablePrompt()` - Natural language
- `generateStructuredJSON()` - Machine-readable format

**Output**:
```javascript
{
  json: "{ full timeline JSON }",
  text: "SHOT 1: Wide shot... SHOT 2: Close-up...",
  structured: [{ shot1 }, { shot2 }, ...],
  negativePrompt: "blurry, low-res, ..."
}
```

### Contexts

#### ApiStatusContext.tsx
**Purpose**: Track API status across the app

**State**:
- `status`: 'idle' | 'loading' | 'success' | 'error' | 'retrying'
- `message`: User-facing status message

**Usage**: Shows loading indicators, retry messages, errors

#### UsageContext.tsx
**Purpose**: Log and track API usage

**State**:
- `apiLogs`: Array of all API calls with token counts
- `totalTokens`: Running total

**Features**:
- Export usage data
- Filter by model, status, time range
- Calculate costs (if pricing known)

### Hooks

#### useProjectData (utils/hooks.ts)
**Purpose**: Central state management for project

**State**:
- `storyBible`, `directorsVision`, `scenes`, `workflowStage`
- `scenesToReview`, `refinedSceneIds`

**Functions**:
- `handleGenerateStoryBible()`
- `handleGenerateScenes()`
- `applySuggestions()`

**Features**:
- Orchestrates multi-step generation workflows
- Progress tracking
- Error handling
- Auto-persistence to IndexedDB

#### usePersistentState
**Purpose**: localStorage wrapper with automatic sync

**Usage**:
```javascript
const [value, setValue] = usePersistentState('key', defaultValue);
// Automatically saves to localStorage on change
```

### Components (Highlights)

#### TimelineEditor.tsx
**Features**:
- Drag-and-drop shot reordering
- Shot editing (description, enhancers)
- Transition selection
- Batch processing UI
- Local generation trigger
- Co-Director integration
- Scene refinement tracking

#### ContinuityDirector.tsx
**Features**:
- Video upload
- Frame extraction
- Analysis display
- Continuity score visualization
- Suggestion application
- Timeline extension

#### LocalGenerationSettingsModal.tsx
**Features**:
- Server URL configuration
- Auto-discovery
- Connection testing
- Workflow sync
- Mapping configuration (manual/auto)
- Pre-flight check results

---

## API Interactions

### Gemini API

#### Request Format (Example: Story Bible)
```javascript
POST https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent

Headers:
  Content-Type: application/json

Body:
{
  "contents": "You are a master storyteller...",
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "properties": {
        "logline": { "type": "string" },
        "characters": { "type": "string" },
        "setting": { "type": "string" },
        "plotOutline": { "type": "string" }
      },
      "required": ["logline", "characters", "setting", "plotOutline"]
    }
  }
}
```

#### Response Format
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "text": "{\"logline\":\"...\", \"characters\":\"...\", ...}"
      }]
    },
    "finishReason": "STOP"
  }],
  "usageMetadata": {
    "promptTokenCount": 150,
    "candidatesTokenCount": 300,
    "totalTokenCount": 450
  }
}
```

#### Error Handling
```javascript
try {
  const result = await api.generateContent(...);
} catch (error) {
  if (error.message.includes('429') || error.message.includes('quota')) {
    // Rate limit - retry with backoff
  } else if (error.message.includes('SAFETY')) {
    // Safety filter triggered
  } else {
    // Other error
  }
}
```

### ComfyUI API

#### System Stats
```javascript
GET http://localhost:8188/system_stats

Response:
{
  "system": { "os": "Windows", "ram": 32000 },
  "devices": [
    {
      "name": "NVIDIA RTX 3090",
      "type": "cuda",
      "vram_total": 25769803776,
      "vram_free": 20000000000
    }
  ]
}
```

#### Queue Prompt
```javascript
POST http://localhost:8188/prompt

Body:
{
  "prompt": { /* workflow JSON */ },
  "client_id": "csg_12345"
}

Response:
{
  "prompt_id": "abc-123",
  "number": 5,
  "node_errors": {}
}
```

#### WebSocket Messages
```javascript
ws://localhost:8188/ws?clientId=csg_12345

Message Types:
{
  "type": "status",
  "data": { "queue_remaining": 2 }
}

{
  "type": "executing",
  "data": { "prompt_id": "abc-123", "node": "3" }
}

{
  "type": "progress",
  "data": { "prompt_id": "abc-123", "value": 10, "max": 20 }
}

{
  "type": "executed",
  "data": {
    "prompt_id": "abc-123",
    "output": {
      "images": [{
        "filename": "output_00001.png",
        "subfolder": "",
        "type": "output"
      }]
    }
  }
}
```

---

## Storage & Persistence

### IndexedDB Schema
```javascript
Database: "projectDatabase"
Version: 1

Object Store: "projects"
Key Path: "id"

Structure:
{
  id: "project_12345",
  name: "My Epic Story",
  lastModified: 1699999999999,
  data: {
    storyBible: { logline, characters, ... },
    directorsVision: "...",
    scenes: [{ id, title, summary, timeline }, ...],
    generatedImages: { [sceneId]: base64String },
    generatedShotImages: { [shotId]: base64String },
    continuityData: { [sceneId]: { videoSrc, analysis, ... } },
    localGenSettings: { comfyUIUrl, ... },
    localGenStatus: { [sceneId]: { status, ... } },
    scenesToReview: ["sceneId1", "sceneId2"]
  }
}
```

### localStorage Keys
```javascript
"hasSeenWelcome": boolean
"localGenSettings": LocalGenerationSettings
"generatedImages": Record<string, base64>
"generatedShotImages": Record<string, base64>
"continuityData": Record<string, SceneContinuityData>
"localGenStatus": Record<string, LocalGenerationStatus>
"apiLogs": ApiCallLog[]
```

### Project Export Format (.json)
```json
{
  "version": "1.0",
  "exportDate": "2025-11-07T18:00:00.000Z",
  "projectName": "My Epic Story",
  "storyBible": { ... },
  "directorsVision": "...",
  "scenes": [ ... ],
  "generatedImages": { ... },
  "generatedShotImages": { ... },
  "continuityData": { ... },
  "localGenSettings": { ... },
  "localGenStatus": { ... },
  "scenesToReview": [ ... ]
}
```

---

## Error Handling & Resilience

### Retry Strategy
- **Exponential Backoff**: 1s, 2s, 4s (+ random jitter)
- **Conditions**: Only retry on 429/quota errors
- **Max Attempts**: 3
- **User Feedback**: Shows retry countdown

### Error Types

1. **Rate Limit (429)**
   - Action: Auto-retry with backoff
   - User: "Model is busy, retrying in 3s..."

2. **Quota Exceeded**
   - Action: Stop retries
   - User: "API quota exceeded. Check billing."

3. **Safety Filter**
   - Action: Stop, no retry
   - User: "Content filtered. Try different wording."

4. **Network Error**
   - Action: Fail fast
   - User: "Connection failed. Check internet."

5. **Validation Error**
   - Action: Fail fast
   - User: Specific validation message

### Graceful Degradation

- **No Gemini API**: Can still edit timelines manually
- **No ComfyUI**: Can still use Gemini image generation
- **No IndexedDB**: Falls back to memory-only (with warning)

---

## Performance Optimizations

### 1. Context Pruning
Reduces token usage by 70-80% for complex operations:
- Summarizes full context into focused briefs
- Uses `gemini-2.5-pro` for summarization quality
- Low temperature (0.2) for consistency

### 2. Lazy Loading
- Components load only when needed
- Images loaded on-demand (not eagerly)
- Heavy computations deferred until visible

### 3. Debouncing
- Search inputs debounced (300ms)
- Auto-save debounced (1000ms)
- Prevents excessive API calls

### 4. Batch Operations
- Single API call for multiple shots
- Reduces latency and costs
- Ensures consistency across batch

### 5. Caching
- Generated images cached in state and localStorage
- API responses not re-fetched unnecessarily
- ComfyUI workflows cached until manually re-synced

### 6. Parallel Processing
- Independent API calls made in parallel (where possible)
- Image generation can happen while text generation proceeds

---

## Security Considerations

### API Key Protection
- ✅ `.env.local` not committed to Git (.gitignore)
- ✅ API key only in environment variables
- ⚠️ Client-side app - key visible in browser network tab
  - **Recommendation**: For production, use backend proxy

### CORS & ComfyUI
- ComfyUI allows CORS by default (local server)
- No authentication required (local-only)
- ⚠️ Do not expose ComfyUI to internet without auth

### Data Privacy
- ✅ All story data stored locally (browser)
- ✅ No analytics or tracking
- ⚠️ API calls to Gemini (Google's privacy policy applies)

### Input Validation
- ✅ File type validation (video uploads)
- ✅ URL validation (ComfyUI server)
- ✅ JSON schema validation (all API responses)

---

## Future Enhancements

### Planned Features
1. **Multi-user Collaboration** - Shared projects via cloud sync
2. **Template Library** - Pre-made story structures and visions
3. **Audio Integration** - Add music/sound effects to timelines
4. **Advanced Animation** - Keyframe interpolation for smoother video
5. **Export Formats** - Final Cut Pro XML, Premiere XML, screenplay PDF
6. **Character Consistency** - Track character appearances across scenes
7. **Budget Estimation** - Estimate production costs based on timeline
8. **Storyboard View** - Visual layout of all shots
9. **Voice Direction** - Record voice notes for shots
10. **Team Roles** - Assign different stages to different team members

### Technical Improvements
1. **Backend API** - Proxy for Gemini API (hide key)
2. **WebRTC** - Peer-to-peer sharing
3. **Progressive Web App** - Offline support
4. **Service Worker** - Background processing
5. **WebAssembly** - Faster video processing
6. **GPU.js** - Client-side GPU acceleration for effects

---

## Conclusion

**gemDirect1** is a comprehensive, production-ready application that bridges the gap between creative storytelling and technical video generation. It leverages cutting-edge AI (Gemini) and local generation capabilities (ComfyUI) to provide a seamless, end-to-end workflow for cinematic content creation.

**Key Strengths**:
- ✅ Intelligent AI assistance at every stage
- ✅ Flexible and extensible architecture
- ✅ Local-first approach (privacy, control)
- ✅ ComfyUI integration (unlimited local generation)
- ✅ Comprehensive error handling
- ✅ Token-efficient operations
- ✅ Intuitive UI/UX

**Ready for**: Testing, refinement, and deployment!

---

**Setup Complete**: http://localhost:3000
**Documentation**: See LOCAL_SETUP_GUIDE.md and COMFYUI_INTEGRATION.md
