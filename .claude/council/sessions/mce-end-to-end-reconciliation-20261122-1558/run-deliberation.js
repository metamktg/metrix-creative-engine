// Canonical deliberation workflow for agentic-council (all themes).
// The engine writes a per-session copy of this file with the single line marked
// "ENGINE REPLACES THIS LINE" rewritten to a literal `INPUT` object, then runs
// THAT copy via the Workflow tool's `scriptPath` (no `args` parameter). Passing
// large nested payloads through the runtime `args` global proved unreliable
// (roster.skillContent, interviewTranscript); injecting literals is deterministic.
// Everything below the INPUT line is invoked byte-for-byte unchanged.
//
// INPUT contract:
//   sessionDir          absolute path to $SESSION_DIR (must exist, with deliberation/round{1,2,3}/)
//   workspace           absolute workspace path
//   idea                the idea under deliberation
//   contextBlock        PROJECT_CONTEXT block text
//   interviewTranscript interview transcript (or topic summary)
//   pairingRules        $CHALLENGE_RULES text from the theme ("organic" or themed rules)
//   roster              [{ name, agentType, model, color, skillContent }]
//   rounds              3 (default) | 1 for position-only invocations (quick-style, guided gate)
//   maxPairs            max tension pairs (default 4)
//   challengeModel      model tier for Round 2 challenge agents (null → each member's own model)
//   guidedFeedback      user feedback injected into pairing (guided mode, second invocation)
//   startAtRound        1 (default) | 2 to resume from pairing using round1 files on disk
//   surveyModel         model tier for the shared codebase-survey agent (cheap tier recommended)
//   designTemplate      reserved; "engine" = the engine's design.md section layout
//   scribePath          optional absolute path to render-session.py; when set, agents
//                       rerun the live session page after saving their round files

export const meta = {
  name: 'council-deliberation',
  description: 'Council deliberation: parallel positions, tension-pair challenges, convergence, synthesis',
  phases: [
    { title: 'Survey', detail: 'one agent maps the codebase for all members to share' },
    { title: 'Position', detail: 'all members write positions in parallel' },
    { title: 'Pairing', detail: 'judge selects 2-4 tension pairs from positions' },
    { title: 'Challenge', detail: 'pair members rebut each other' },
    { title: 'Converge', detail: 'all members write final positions' },
    { title: 'Synthesis', detail: 'conductor persona writes design.md' },
  ],
}

const INPUT = {"sessionDir":"/home/user/metrix-creative-engine/.claude/council/sessions/mce-end-to-end-reconciliation-20261122-1558","workspace":"/home/user/metrix-creative-engine","idea":"metrix-creative-engine end-to-end reconciliation: plugins and skills packaging, stage handoffs, storyboarding, raw Kie generation into post-production (sound, audio, SFX, graphics, transitions, cuts, captions), so a Metrix IAP brief JSON produces finished, gated, launch-ready creative for every format, passing CI.","contextBlock":"PROJECT_CONTEXT\nRepo: /home/user/metrix-creative-engine (metrix-creative-engine). Node 22 + TypeScript MCP server in src/ (brief.ts brief gate, tools.ts, prompts.ts, client.ts/protocol.ts Kie client, ledger.ts). Skills in skills/ (metrix-ad-creative router-ish, kie-generate, kie-tasks, ugc-creator-edit, metrix-video-assembly with ~25 stage CLIs under scripts/: storyboard check, timeline plan/check/emit, captions/cues, phrase-map, asr-check, render.mjs CDP renderer + runtime.js, qa-video, audio-graph, compose-bed, beats, make-row for MST rows, placement-zones; plus 9 vendored HyperFrames skills incl. media-use). Python review gates in scripts/ (validate_review_gates.py, prepare_review_record.py, check_script.py). Prompts in prompts/ (00-core, 02-render-bridge, 03-handoff, 05-mst, 06-production-review, formats/*). Gate: npm run verify (copies, generated standard, typecheck, vitest, build, MCP surface, python suites). CLAUDE.md -> AGENTS.md: byte copies via scripts/skill-copies.json, never edit copies; backend/brief schema changes only when a field is needed, new fields optional; client data only in gitignored out/ renders/.\nUpstream: Metrix IAP produces creative_briefs.json (metrix-brief-builder); downstream metrix-mst-creative-scan. Spend path: Kie.ai (images, Veo/Kling/Seedance video, TTS, music) with a JSONL ledger.\nState today: verify green on branch engineering/jolly-hamilton-dwi3ej after a runtime.js canvas-capture fix for stale video frames (main CI was red on #17/#18).\nRead docs/audits/2026-11-21-engine-environment-and-workflow-audit.md first (broken handoffs, per-format gaps).","interviewTranscript":"Decisions settled by the owner (grilling Q1-Q10, recommendations accepted):\nQ1 Build non-video pieces in parallel; nothing touching render.mjs/runtime.js merges unless verify + CI green. (Render bug now fixed.)\nQ2 Build a run spine: mce.run/1 manifest + one run command (plan, generate, assemble, qa, review, handoff); each stage reads prior outputs by hash and appends its own.\nQ3 Brief schema: Metrix IAP should publish a versioned JSON schema this repo pins; until then extend brief.ts with optional fields under the same names (cells, matrix_naming_convention, cards, feed, script).\nQ4 One format registry read by brief, prompts, storyboard, render, QA, review.\nQ5 New format order: static-compose (model scene + HTML type with real fonts), shopping/catalog/DPA, carousel, VO route (TTS + ASR proof vs locked script), b-roll route (shot list from timeline gaps, model per shot), footage ingest + grade.\nQ6 Every non-Kie output (direct Gemini/Veo, Higgsfield, Canva, desktop edits) re-enters through the ledger and the same QA and review.\nQ7 One Kie client: bundle kie.mjs from src/ after the spine.\nQ8 metrix-ad-creative becomes the single router for brief work; generic skills point brief work back to it.\nQ9 Package the 16 skills as one plugin (plugin.json) so plugin validate/eval/details run in CI.\nQ10 Spend-path skills need stubbed eval cases in CI (matrix brief, missing-asset blocker, lip sync without packet).\nDeepen findings: (1) render.mjs safe zone bottom 20% vs placement-zones.json 35%; (2) format knowledge in 6 places; (3) brief.ts strips cells/matrix_naming_convention that make-row reads; brand_assets array vs docs object; (4) no run spine, 03-handoff.md never loaded, no receipt; (5) validate_review_gates.py never reads qa-video output; (6) per-script tool resolution with X:/ Windows defaults; (7) two Kie protocol implementations; (8) no single entry skill; (9) vendored media-use routes generation to HeyGen outside the ledger; (10) metrix-video-assembly SKILL.md 607 lines; (11) no evals on spend-path skills; (12) skills not packaged as a plugin.\nOwner's focus for this council: make sure plugins, skills, handoffs, storyboarding, raw Kie generations, then post-production editing with all sound, audio, SFX, graphics (GFX), transitions, cuts and captions are designed to work end to end and pass CI, at top-tier agency quality, for every format the brief JSON can declare. Owner standards: proof on every technical claim, no compliance/legal content, no disclaimers.","pairingRules":"organic: pick 2-4 pairs from direct contradictions, resource conflicts, priority clashes, trade-off surfaces in Round 1 positions","roster":[{"name":"Architect","agentType":"agentic-council:Architect","model":"opus","color":"#60a5fa","skillContent":"---\nname: \"codebase-context\"\ndepartment: \"architect\"\ndescription: \"Use when analyzing an existing codebase for architecture, tech stack, conventions, and infrastructure. Covers project structure mapping, data model discovery, integration point cataloging, and constraint identification. Do not use for schema changes (use schema-design) or API contract definition (use api-design).\"\nversion: 1\ntriggers:\n- \"codebase\"\n- \"context\"\n- \"architecture\"\n- \"infrastructure\"\n- \"tech stack\"\n- \"project structure\"\n---\n\n# Codebase Context\n\n## Purpose\n\nAnalyze the existing codebase and produce a comprehensive context briefing covering architecture, data model, patterns, and constraints. This output becomes shared context for ALL council agents — it is the foundation every other skill builds on.\n\n## Scope Constraints\n\n- Produces read-only analysis; does not modify any project files.\n- Covers architecture, data model, conventions, infrastructure, and integrations.\n- Does not design new schemas or API contracts — hand off to schema-design or api-design.\n\n## Inputs\n\n- Project root directory ($WORKSPACE)\n- Any existing CLAUDE.md or project documentation\n- Package manifests (package.json, pyproject.toml, Cargo.toml, etc.)\n- Configuration files (tsconfig.json, next.config.js, .env.example, etc.)\n\n## Input Sanitization\n\nNo user-provided values are used in commands or file paths. All inputs are treated as read-only analysis targets.\n\n## Procedure\n\n### Progress Checklist\n<!-- Track completion across compaction boundaries -->\n- [ ] Step 1: Read Project Configuration\n- [ ] Step 2: Map Directory Structure\n- [ ] Step 3: Identify Core Architectural Patterns\n- [ ] Step 4: Map the Existing Data Model\n- [ ] Step 5: Catalog Key Conventions\n- [ ] Step 6: Note Infrastructure Constraints\n- [ ] Step 7: Identify Integration Points\n\n### Step 1: Read Project Configuration\n\nRead CLAUDE.md, package.json (or equivalent), tsconfig, and any config files at the project root. Extract framework, language version, key dependencies, and build tooling.\n\n### Step 2: Map Directory Structure\n\nList top-level directories and identify their purposes. Recurse one level into key directories (src/, app/, lib/, components/, etc.) to understand the organizational pattern.\n\n### Step 3: Identify Core Architectural Patterns\n\nDetermine the routing approach (file-based, config-based), data fetching strategy (SSR, SSG, CSR, RSC), state management solution, and component patterns (atomic, feature-based, etc.).\n\n### Step 4: Map the Existing Data Model\n\nRead database schema files, migration history, or ORM models. List tables, their relationships, key entities, and access control policies (e.g., RLS policies for Supabase).\n\n### Step 5: Catalog Key Conventions\n\nIdentify naming conventions (camelCase vs snake_case, file naming), file structure patterns, import conventions (barrel exports, path aliases), and error handling patterns used throughout the codebase.\n\n### Step 6: Note Infrastructure Constraints\n\nDocument hosting platform, database type and version, auth provider, CDN configuration, edge function usage, environment variable patterns, and deployment pipeline.\n\n### Step 7: Identify Integration Points\n\nCatalog external APIs, webhooks, third-party services, and any inter-service communication patterns. Note authentication methods for each integration.\n\n> **Compaction resilience**: If context was lost during a long session, re-read the Inputs section to reconstruct what system is being analyzed, check the Progress Checklist for completed steps, then resume from the earliest incomplete step.\n\n## Handoff\n\n- If the analysis reveals schema issues, inconsistencies, or new entity requirements, recommend loading architect/schema-design.\n- If the analysis reveals API surface gaps, endpoint inconsistencies, or missing contracts, recommend loading architect/api-design.\n\n## Output Format\n\n```markdown\n# Context Briefing\n\n## Tech Stack\n- **Framework**: [name + version]\n- **Language**: [name + version]\n- **Database**: [type + provider]\n- **Auth**: [provider + method]\n- **Hosting**: [platform]\n- **Key Dependencies**: [list with versions]\n\n## Directory Structure\n```\n[tree output with annotations]\n```\n\n## Architectural Patterns\n- **Routing**: [approach]\n- **Data Fetching**: [strategy]\n- **State Management**: [solution]\n- **Component Pattern**: [style]\n\n## Data Model\n| Entity | Key Fields | Relationships |\n|--------|-----------|---------------|\n| ...    | ...       | ...           |\n\n[ASCII relationship diagram if complex]\n\n## Conventions\n1. [Convention with example]\n2. [Convention with example]\n3. [Convention with example]\n\n## Infrastructure Constraints\n- [Constraint and implication]\n- [Constraint and implication]\n\n## Integration Points\n| Service | Purpose | Auth Method |\n|---------|---------|-------------|\n| ...     | ...     | ...         |\n\n## Warnings / Tech Debt\n- [Known issue or constraint that affects design decisions]\n```\n\n## Quality Checks\n\n- [ ] No hardcoded file paths — all paths are relative to $WORKSPACE\n- [ ] All 7 process areas are covered in the output\n- [ ] At least 3 conventions are identified and documented with examples\n- [ ] Tech stack versions are specified (not just names)\n- [ ] Data model section includes relationships, not just entity lists\n- [ ] Integration points include auth methods\n- [ ] Warnings section flags any constraints that would affect new feature design\n\n## Evolution Notes\n<!-- Observations appended after each use -->\n\n\n---\nname: \"api-design\"\ndepartment: \"architect\"\ndescription: \"Use when designing REST or RPC endpoint contracts with request/response types and error handling. Covers endpoint specification, TypeScript type definitions, authentication requirements, pagination, and caching strategies. Do not use for database schema changes (use schema-design) or codebase analysis (use codebase-context).\"\nversion: 1\ntriggers:\n- \"API\"\n- \"endpoint\"\n- \"route\"\n- \"REST\"\n- \"RPC\"\n- \"server action\"\n- \"webhook\"\n- \"contract\"\n---\n\n# API Design\n\n## Purpose\n\nDesign REST/RPC endpoint contracts with request/response types, error handling, and versioning strategy. Produces TypeScript type definitions and endpoint documentation that serve as the contract between frontend and backend.\n\n## Scope Constraints\n\n- Produces endpoint contracts and type definitions only; does not implement route handlers.\n- Covers endpoint specification, request/response types, error contracts, pagination, and caching.\n- Does not design database schemas or run codebase analysis — hand off to schema-design or codebase-context.\n\n## Inputs\n\n- Feature requirements (from interview/idea phase)\n- Schema design output (entities, relationships — drives endpoint shape)\n- Existing endpoints (current route handlers, naming conventions)\n- Authentication/authorization model (who can call what)\n\n## Input Sanitization\n\nNo user-provided values are used in commands or file paths. All inputs are treated as read-only analysis targets.\n\n## Procedure\n\n### Progress Checklist\n<!-- Track completion across compaction boundaries -->\n- [ ] Step 1: Inventory Existing Endpoints\n- [ ] Step 2: Identify New Endpoints Needed\n- [ ] Step 3: Define Endpoint Contracts\n- [ ] Step 4: Design Type Definitions\n- [ ] Step 5: Plan Authentication/Authorization\n- [ ] Step 6: Define Error Contract\n- [ ] Step 7: Consider Pagination and Filtering\n- [ ] Step 8: Document Rate Limits and Caching\n\n### Step 1: Inventory Existing Endpoints\n\nRead current route handlers and list all existing paths, HTTP methods, request/response shapes, and auth requirements. Note naming conventions and patterns in use.\n\n### Step 2: Identify New Endpoints Needed\n\nFrom the feature requirements and schema design output, determine what operations the frontend needs. Group by resource and map to CRUD operations where applicable.\n\n### Step 3: Define Endpoint Contracts\n\nFor each endpoint, specify:\n- **Method**: GET, POST, PUT, PATCH, DELETE\n- **Path**: Following existing naming conventions\n- **Request**: Body schema, URL params, query params\n- **Response**: Success shape (with HTTP status), error shape\n- **Auth**: Required role/permission, or public\n\n### Step 4: Design Type Definitions\n\nWrite TypeScript interfaces for:\n- Request body types\n- Response types (success and error)\n- Shared types (enums, union types, reusable shapes)\n- Zod schemas for runtime validation where applicable\n\n### Step 5: Plan Authentication/Authorization\n\nFor each endpoint, define:\n- Whether authentication is required\n- What role or permission is needed\n- How authorization is enforced (middleware, RLS, inline check)\n- Service-to-service auth if applicable\n\n### Step 6: Define Error Contract\n\nDesign a consistent error response shape:\n- Error code enum (application-level codes, not just HTTP status)\n- Error response structure (code, message, details)\n- HTTP status mapping (which app errors map to which HTTP statuses)\n- Validation error format (field-level errors for form submissions)\n\n### Step 7: Consider Pagination and Filtering\n\nFor list endpoints:\n- Pagination strategy (cursor-based preferred for real-time data, offset for static)\n- Filter parameters (query string format, supported operators)\n- Sort parameters (field + direction)\n- Default and maximum page sizes\n\n### Step 8: Document Rate Limits and Caching\n\nIf applicable:\n- Rate limit tiers per endpoint or endpoint group\n- Cache-Control headers for GET endpoints\n- ETag/If-None-Match for conditional requests\n- Stale-while-revalidate strategies\n\n> **Compaction resilience**: If context was lost during a long session, re-read the Inputs section to reconstruct what system is being analyzed, check the Progress Checklist for completed steps, then resume from the earliest incomplete step.\n\n## Handoff\n\n- If the API design reveals missing or incomplete database entities, recommend loading architect/schema-design.\n- If the API exposes sensitive data or requires fine-grained access control, recommend loading guardian/data-classification.\n\n## Output Format\n\n```markdown\n# API Design: [Feature Name]\n\n## Endpoint Overview\n\n| Method | Path | Auth | Description |\n|--------|------|------|-------------|\n| GET    | /api/... | authenticated | ... |\n| POST   | /api/... | authenticated | ... |\n\n## Type Definitions\n\n```typescript\n// Shared types\ninterface PaginatedResponse<T> {\n  data: T[];\n  cursor: string | null;\n  hasMore: boolean;\n}\n\n// Request types\ninterface CreateFooRequest {\n  name: string;\n  // ...\n}\n\n// Response types\ninterface FooResponse {\n  id: string;\n  name: string;\n  createdAt: string;\n  // ...\n}\n```\n\n## Error Contract\n\n```typescript\nenum ErrorCode {\n  VALIDATION_ERROR = 'VALIDATION_ERROR',\n  NOT_FOUND = 'NOT_FOUND',\n  UNAUTHORIZED = 'UNAUTHORIZED',\n  FORBIDDEN = 'FORBIDDEN',\n  // ...\n}\n\ninterface ApiError {\n  code: ErrorCode;\n  message: string;\n  details?: Record<string, string[]>; // field-level errors\n}\n```\n\n| Error Code | HTTP Status | When |\n|-----------|-------------|------|\n| VALIDATION_ERROR | 400 | Request body fails validation |\n| NOT_FOUND | 404 | Resource does not exist |\n| UNAUTHORIZED | 401 | Missing or invalid auth |\n| FORBIDDEN | 403 | Authenticated but lacking permission |\n\n## Endpoint Details\n\n### [METHOD] [path]\n\n**Auth**: [requirement]\n\n**Request**:\n```typescript\n// params / body / query\n```\n\n**Response** (200):\n```typescript\n// success shape\n```\n\n**Errors**:\n- 400: [when]\n- 404: [when]\n\n**Example**:\n```bash\ncurl -X POST /api/foo \\\n  -H \"Authorization: Bearer ...\" \\\n  -d '{\"name\": \"bar\"}'\n```\n\n## Pagination Strategy\n- **Method**: [cursor-based / offset]\n- **Default page size**: [N]\n- **Max page size**: [N]\n\n## Caching Strategy\n| Endpoint Pattern | Cache-Control | Notes |\n|-----------------|---------------|-------|\n| GET /api/...    | ...           | ...   |\n```\n\n## Quality Checks\n\n- [ ] Every endpoint has defined auth requirements\n- [ ] Error cases are enumerated for each endpoint\n- [ ] Request and response types are fully specified (no `any` types)\n- [ ] Naming follows existing project conventions (REST or RPC, plural vs singular)\n- [ ] List endpoints include pagination strategy\n- [ ] Shared types are extracted (no duplication across endpoints)\n- [ ] Error contract is consistent across all endpoints\n- [ ] Examples include realistic request/response payloads\n\n## Evolution Notes\n<!-- Observations appended after each use -->\n"},{"name":"Artisan","agentType":"agentic-council:Artisan","model":"opus","color":"#f472b6","skillContent":"---\nname: motion-design\ndepartment: \"artisan\"\ndescription: \"Use when designing the motion language for a feature or system. Covers transition specs, micro-interaction definitions, choreography principles, performance constraints, and reduced-motion alternatives. Do not use for visual design critique (use visual-audit) or design token architecture (use design-system-architecture).\"\nversion: 1\ntriggers:\n- \"animation\"\n- \"transition\"\n- \"motion\"\n- \"easing\"\n- \"micro-interaction\"\n- \"reduced-motion\"\n- \"choreography\"\n- \"loading\"\n- \"skeleton\"\n---\n\n# Motion Design\n\n## Purpose\n\nDesign the motion language for a feature or system, including transition specs, micro-interaction definitions, choreography principles, and reduced-motion alternatives.\n\n## Scope Constraints\n\nReads existing animation code, CSS transitions, and motion specifications for analysis. Does not modify source files or execute animations. Does not generate production animation code directly.\n\n## Inputs\n\n- Feature or component requiring motion design\n- Existing animation patterns in the project (if any)\n- Performance constraints (target FPS, device capabilities)\n- Accessibility requirements (prefers-reduced-motion support)\n\n## Input Sanitization\n\nNo user-provided values are used in commands or file paths. All inputs are treated as read-only analysis targets.\n\n## Procedure\n\n### Progress Checklist\n- [ ] Step 1: Identify motion opportunities\n- [ ] Step 2: Define motion principles\n- [ ] Step 3: Spec each animation\n- [ ] Step 4: Design choreography\n- [ ] Step 5: Reduced-motion alternatives\n- [ ] Step 6: Performance considerations\n\n### Step 1: Identify Motion Opportunities\n\nCatalog where motion adds meaning:\n- **State transitions:** Loading to loaded, collapsed to expanded, hidden to visible\n- **Navigation transitions:** Screen push/pop, modal present/dismiss, tab switch\n- **Feedback responses:** Button press, form submission, error shake, success check\n- **Attention guidance:** New item appears, notification badge, scroll-to-target\n- **Data changes:** List reorder, item add/remove, value count-up\n\n### Step 2: Define Motion Principles\n\nEstablish the motion language for this project:\n- **Duration scale:** Micro (100ms), short (200ms), medium (300ms), long (500ms)\n- **Easing curves:** Enter (ease-out), exit (ease-in), standard (ease-in-out)\n- **Stagger:** Delay between sequential items (50-100ms per item, max 5 items)\n- **Distance:** How far elements travel relative to their size\n\n### Step 3: Spec Each Animation\n\nFor each motion opportunity, define:\n- **Property:** What changes (opacity, transform, height, color)\n- **Duration:** How long (from the duration scale)\n- **Easing:** Which curve (from the easing set)\n- **Delay:** When it starts relative to the trigger\n- **Direction:** Where it moves from/to\n\n### Step 4: Design Choreography\n\nFor multi-element transitions:\n- **Entrance order:** What appears first, second, third\n- **Stagger timing:** Delay between each element\n- **Shared elements:** Elements that morph between states\n- **Exit choreography:** Reverse of entrance, or distinct exit pattern\n\n### Step 5: Reduced-Motion Alternatives\n\nFor every animation, define the prefers-reduced-motion alternative:\n- **Instant transitions:** Replace motion with opacity crossfade\n- **Remove parallax:** Static positioning instead\n- **Simplify choreography:** Single fade-in instead of staggered entrance\n- **Keep functional animation:** Loading spinners stay (they communicate state)\n\n### Step 6: Performance Considerations\n\nVerify motion feasibility:\n- **Composite-only properties:** Prefer transform and opacity (GPU-accelerated)\n- **Avoid layout thrash:** Don't animate width, height, top, left\n- **will-change hints:** Add for elements that will animate\n- **60fps budget:** Each frame must complete in <16.6ms\n\n> **Compaction resilience**: If context was lost during a long session, re-read the Inputs section to reconstruct what feature is being designed, check the Progress Checklist for completed steps, then resume from the earliest incomplete step.\n\n## Output Format\n\n```markdown\n# Motion Design Specification\n\n## Motion Principles\n| Property | Value | Usage |\n|----------|-------|-------|\n| Duration (micro) | 100ms | Hover, focus |\n| Duration (short) | 200ms | Expand, collapse |\n| Duration (medium) | 300ms | Page transitions |\n| Ease (enter) | cubic-bezier(0, 0, 0.2, 1) | Elements appearing |\n| Ease (exit) | cubic-bezier(0.4, 0, 1, 1) | Elements leaving |\n| Stagger | 50ms | List items |\n\n## Animation Specs\n\n### [Component/Interaction Name]\n**Trigger:** [User action or state change]\n**Property:** [What changes]\n**From → To:** [Start value → End value]\n**Duration:** [From scale]\n**Easing:** [From set]\n**Reduced motion:** [Alternative]\n\n## Choreography\n### [Transition Name]\n1. [Element] fades in at 0ms (200ms, ease-out)\n2. [Element] slides up at 50ms (200ms, ease-out)\n3. [Element] fades in at 100ms (200ms, ease-out)\n\n## Reduced Motion Summary\n| Animation | Full Motion | Reduced Motion |\n|-----------|------------|----------------|\n| Page enter | Slide + fade | Instant fade |\n| List stagger | Staggered slide-up | Single fade |\n| Loading | Spinner | Spinner (kept) |\n```\n\n## Handoff\n\n- Hand off to visual-audit if motion design reveals visual hierarchy issues needing interface-level critique.\n- Hand off to design-system-architecture if animation tokens (durations, easings) need integration into the design token system.\n\n## Quality Checks\n\n- [ ] Every animation has a purpose (communicates state change, guides attention, or provides feedback)\n- [ ] Duration and easing values come from the defined scale, not arbitrary values\n- [ ] Every animation has a prefers-reduced-motion alternative\n- [ ] Animations use composite-only properties (transform, opacity) where possible\n- [ ] Stagger timing doesn't exceed 5 items (cap the stagger, fade the rest)\n- [ ] No animation exceeds 500ms (users perceive delays >400ms as laggy)\n\n## Evolution Notes\n<!-- Observations appended after each use -->\n"},{"name":"Craftsman","agentType":"agentic-council:Craftsman","model":"opus","color":"#a78bfa","skillContent":"---\nname: \"testing-strategy\"\ndepartment: \"craftsman\"\ndescription: \"Use when designing test plans for new features or improving existing test coverage. Covers test pyramid design, coverage targets, quality gates, and test file specifications. Do not use for codebase pattern audits or convention enforcement (use pattern-analysis).\"\nversion: 1\ntriggers:\n- \"test\"\n- \"testing\"\n- \"unit test\"\n- \"integration test\"\n- \"e2e\"\n- \"coverage\"\n- \"CI\"\n- \"quality gate\"\n- \"regression\"\n- \"TDD\"\n---\n\n# Testing Strategy\n\n## Purpose\n\nDesign comprehensive test strategies with test pyramid coverage, test file structure, and quality gates.\n\n## Scope Constraints\n\n- Covers test plan design, pyramid layering, coverage targets, and CI quality gates.\n- Does not cover codebase pattern auditing or convention enforcement — hand off to pattern-analysis.\n- Does not cover architectural decisions about system boundaries — hand off to architect department.\n\n## Inputs\n\n- Feature description and scope\n- Existing test infrastructure (framework, runner, coverage tools)\n- CI/CD pipeline details (if relevant)\n- Existing test conventions in the codebase\n- Coverage targets or requirements (if any)\n\n## Input Sanitization\n\nNo user-provided values are used in commands or file paths. All inputs are treated as read-only analysis targets.\n\n## Procedure\n\n### Progress Checklist\n\n- [ ] Step 1: Audit existing test infrastructure\n- [ ] Step 2: Identify testable units\n- [ ] Step 3: Design test pyramid\n- [ ] Step 4: Write test specifications\n- [ ] Step 5: Define coverage targets\n- [ ] Step 6: Plan quality gates\n\n### Step 1: Audit Existing Test Infrastructure\n\n- Test framework (Jest, Vitest, Playwright, Cypress, etc.)\n- Test runner and configuration\n- Coverage tools (Istanbul, c8, etc.)\n- CI integration (GitHub Actions, etc.)\n- Existing test patterns (file location, naming, describe/it structure)\n- Existing mocking patterns (jest.mock, vi.mock, MSW, etc.)\n\n### Step 2: Identify Testable Units\n\nFrom the feature, extract:\n- **Pure functions and utilities** — deterministic, no side effects, easiest to test\n- **Data transformations** — input/output mapping, validation logic\n- **API handlers/endpoints** — request/response contracts, error handling\n- **UI components** — render output, interaction behavior, state changes\n- **Integration points** — database queries, external API calls, file I/O\n- **Business logic** — rules, calculations, conditional flows\n\n### Step 3: Design the Test Pyramid\n\n```\n        /  E2E  \\        <- Few: critical user paths only (expensive, slow)\n       /----------\\\n      / Integration \\    <- Some: cross-boundary, API contracts, DB queries\n     /----------------\\\n    /    Unit Tests     \\ <- Many: fast, isolated, 80%+ of test count\n   /--------------------\\\n```\n\n- **Unit tests (base):** Fast, isolated, test one thing. Target 80%+ of total test count.\n- **Integration tests (middle):** Cross-boundary tests. Database interactions, API contracts, service-to-service.\n- **E2E tests (top):** Critical user paths only. Expensive to write and maintain, keep count low.\n\n### Step 4: Write Test Specifications\n\nFor each layer, specify:\n\n| Layer | Test File | Test Cases | Mocks Needed | Priority |\n|-------|-----------|------------|--------------|----------|\n| Unit | ... | ... | ... | ... |\n| Integration | ... | ... | ... | ... |\n| E2E | ... | ... | ... | ... |\n\nFor each test case:\n- **Location:** Follow existing convention (co-located `__tests__/`, top-level `tests/`, or `.test.ts` suffix)\n- **Description:** `describe('ModuleName', () => { it('should ...') })` format\n- **Key assertions:** What exactly are we verifying?\n- **Mock strategy:** What to mock (external deps), what to keep real (internal logic)\n- **Edge cases:** Boundary values, empty inputs, error conditions\n\n### Step 5: Define Coverage Targets\n\n- **Line coverage:** Pragmatic target (70-90%, not 100%)\n- **Branch coverage:** Focus on critical paths and business logic branches\n- **Not worth testing:** Glue code, framework boilerplate, simple pass-through, type-only files\n- **Must test:** Business rules, data transformations, error handling, security-sensitive code\n\n### Step 6: Plan Quality Gates\n\n- **Pre-commit:**\n  - Lint (ESLint, Biome)\n  - Type check (tsc --noEmit)\n  - Affected unit tests (if tooling supports)\n- **CI pipeline:**\n  - Full test suite\n  - Coverage threshold check\n  - Build verification\n- **Manual review checklist:**\n  - [ ] New business logic has unit tests\n  - [ ] Error paths are tested\n  - [ ] No snapshot tests for logic (only for stable UI)\n  - [ ] Mocks don't hide real bugs\n  - [ ] Test descriptions read as documentation\n\n> **Compaction resilience:** If context is compacted mid-task, check the Progress Checklist for completed steps, re-read this Procedure section, and continue from the next incomplete step.\n\n## Handoff\n\n- If pattern inconsistencies are discovered in test file structure or naming conventions, hand off to **pattern-analysis** for a full codebase convention audit.\n- If test boundaries reveal unclear architectural boundaries or service decomposition issues, hand off to **architect department** for structural analysis.\n\n## Output Format\n\n### Test Pyramid Summary\n\n| Layer | Count | Run Time | Mock Strategy |\n|-------|-------|----------|---------------|\n| Unit | ... | ... | ... |\n| Integration | ... | ... | ... |\n| E2E | ... | ... | ... |\n\n### Test Specifications\n\nFor each test file:\n\n```\nFile: src/__tests__/feature.test.ts\nLayer: Unit\n\ndescribe('FeatureName')\n  it('should handle the happy path')\n    - Input: ...\n    - Expected: ...\n  it('should handle invalid input')\n    - Input: ...\n    - Expected: throws/returns error\n  it('should handle edge case')\n    - Input: ...\n    - Expected: ...\n\nMocks: ExternalService (return mock data)\n```\n\n### Coverage Targets\n\n| Category | Target | Rationale |\n|----------|--------|-----------|\n| Business logic | 90%+ | Core value, must be correct |\n| API handlers | 80%+ | Contract compliance |\n| UI components | 70%+ | Render + key interactions |\n| Utilities | 90%+ | Pure functions, easy to test |\n| Glue/config | Skip | Not worth testing |\n\n### Quality Gate Checklist\n\n- [ ] Pre-commit hooks configured\n- [ ] CI runs full test suite\n- [ ] Coverage thresholds enforced\n- [ ] New code has corresponding tests\n\n## Quality Checks\n\n- [ ] Every business logic function has a unit test spec\n- [ ] Critical user paths have integration tests\n- [ ] At least 1 E2E test for the main happy-path flow\n- [ ] Mock strategy documented and doesn't hide real bugs\n- [ ] Test file locations follow existing project conventions\n- [ ] Edge cases and error paths included in test specs\n- [ ] Coverage targets are pragmatic (not aspirational 100%)\n\n## Evolution Notes\n<!-- Observations appended after each use -->\n"}],"rounds":3,"maxPairs":3,"challengeModel":null,"surveyModel":"sonnet","designTemplate":"engine","scribePath":"/home/user/metrix-creative-engine/.claude/council/sessions/mce-end-to-end-reconciliation-20261122-1558/render-session.py"}

const {
  sessionDir, workspace, idea,
  contextBlock = '', interviewTranscript = '', pairingRules = 'organic',
  roster = [], rounds = 3, maxPairs = 4,
  challengeModel = null, guidedFeedback = null, startAtRound = 1,
  surveyModel = null, scribePath = null,
} = INPUT

if (!sessionDir || !idea || !Array.isArray(roster) || roster.length === 0) {
  throw new Error('council-deliberation requires inputs: sessionDir, idea, roster[]')
}

const POSITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agent: { type: 'string' },
    coreRecommendation: { type: 'string' },
    summary: { type: 'string', description: 'Position summary in 120 words or fewer' },
    risks: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
    filePath: { type: 'string' },
  },
  required: ['agent', 'coreRecommendation', 'summary', 'filePath'],
}

const PAIRING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          tension: { type: 'string' },
          whyItMatters: { type: 'string' },
        },
        required: ['a', 'b', 'tension', 'whyItMatters'],
      },
    },
  },
  required: ['pairs'],
}

const CHALLENGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agent: { type: 'string' },
    stance: { type: 'string', enum: ['Maintain', 'Modify', 'Defer'] },
    summary: { type: 'string', description: 'Exchange summary in 80 words or fewer' },
    filePath: { type: 'string' },
  },
  required: ['agent', 'stance', 'summary', 'filePath'],
}

const CONVERGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agent: { type: 'string' },
    summary: { type: 'string', description: 'Final position summary in 100 words or fewer' },
    nonNegotiables: { type: 'array', items: { type: 'string' } },
    filePath: { type: 'string' },
  },
  required: ['agent', 'summary', 'filePath'],
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overview: { type: 'string', description: '2-3 sentence executive summary' },
    tensionResolutions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tension: { type: 'string' },
          agents: { type: 'string' },
          resolution: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['tension', 'agents', 'resolution', 'reasoning'],
      },
    },
    decisionLog: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          decision: { type: 'string' },
          optionsConsidered: { type: 'string' },
          chosen: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['decision', 'chosen', 'reasoning'],
      },
    },
    designPath: { type: 'string' },
  },
  required: ['overview', 'tensionResolutions', 'decisionLog', 'designPath'],
}

const byName = {}
for (const m of roster) byName[m.name] = m

const identityBlock = (m) => `You are ${m.name}, the ${m.color} Lens.

## Project Context
${contextBlock}

## The Idea
${idea}

## Interview Transcript
${interviewTranscript}`

// Live session page: non-fatal regeneration after each artifact save (F11).
const scribeNote = scribePath
  ? `\nAfter saving your file, run this exact command via Bash (non-fatal, it regenerates the live session page): python3 "${scribePath}" "${sessionDir}" || true`
  : ''

// ---- Survey: one shared codebase map (replaces N redundant explorations) ----
// Seven members each exploring the same repo costs ~30k tokens apiece. One
// shared map read from disk collapses that to a single survey + cheap reads.
const codebaseMapPath = `${sessionDir}/context/codebase-map.md`
if (startAtRound <= 1) {
  phase('Survey')
  await agent(`You are the council's codebase surveyor. Produce ONE shared map that every council member reads instead of each independently exploring ${workspace}.

Explore ${workspace} efficiently — sample entry points, configs, key modules, data models, test setup, and conventions. Do NOT read every file.

Write a concise map (target under ~1500 words) to ${codebaseMapPath} (create the directory if it does not exist) covering:
- Project shape: languages, frameworks, how it builds/runs, directory layout
- Key modules and their responsibilities, with paths
- Data models / schemas and where they live
- External integrations and system boundaries
- Testing setup and conventions
- Anything a reviewer must know before proposing changes

Return a one-line confirmation.`,
    { label: 'Survey', phase: 'Survey', model: surveyModel || undefined })
  log('Codebase survey complete — members share one map instead of exploring separately')
}

// ---- Round 1: Position (parallel) ----
let positions = []
if (startAtRound <= 1) {
  phase('Position')
  positions = (await parallel(roster.map((m) => () =>
    agent(`${identityBlock(m)}

## Your Loaded Skills
${m.skillContent || '(none loaded)'}

## Round 1: Position
A shared codebase map is at ${codebaseMapPath} — read it FIRST to ground your
position in the actual code. Explore ${workspace} directly ONLY for specifics
your ${m.color} lens needs that the map does not already cover.
Ground your position using the Process steps from your loaded skills; include
skill-formatted outputs as appendices.

Write your position statement:
- Core recommendation (1-2 sentences)
- Key argument (1 paragraph)
- Risks if ignored (2-3 bullets)
- Dependencies on other agents' domains

Save the FULL position to ${sessionDir}/deliberation/round1/${m.name}.md and
return the structured summary (the summary field must stand alone — the
conductor reads only summaries).${scribeNote}`,
      { agentType: m.agentType, model: m.model, label: `R1:${m.name}`, phase: 'Position', schema: POSITION_SCHEMA }),
  ))).filter(Boolean)
  log(`Round 1 complete: ${positions.length}/${roster.length} positions`)
}

if (rounds === 1) {
  return { positions }
}

// ---- Pairing: judgment over R1 summaries (genuine barrier) ----
phase('Pairing')
const positionDigest = positions.length
  ? JSON.stringify(positions, null, 2)
  : `(positions not in memory — read all files under ${sessionDir}/deliberation/round1/)`
const pairing = await agent(`You are the deliberation conductor selecting tension pairs.

## Challenge Rules
${pairingRules}

## Round 1 Position Summaries
${positionDigest}
${guidedFeedback ? `\n## User Feedback To Weigh\n${guidedFeedback}\n` : ''}
Identify 2-${maxPairs} tension pairs — members whose positions directly
contradict, compete for resources, clash on priorities, or surface a real
trade-off that would change the design. Read the full position files under
${sessionDir}/deliberation/round1/ when a summary is insufficient. Member
names must come from: ${roster.map((m) => m.name).join(', ')}.`,
  { label: 'TensionPairing', phase: 'Pairing', schema: PAIRING_SCHEMA })

const validPairs = (pairing.pairs || [])
  .filter((p) => byName[p.a] && byName[p.b] && p.a !== p.b)
  .slice(0, maxPairs)
log(`Tension pairs: ${validPairs.map((p) => `${p.a}<>${p.b}`).join(', ') || '(none — converging directly)'}`)

// ---- Round 2: Challenge (parallel across pair members) ----
let challenges = []
if (validPairs.length > 0) {
  phase('Challenge')
  challenges = (await parallel(
    validPairs
      .flatMap((p) => [[p.a, p.b, p.tension], [p.b, p.a, p.tension]])
      .map(([selfName, otherName, tension]) => () => {
        const m = byName[selfName]
        return agent(`${identityBlock(m)}

## Round 2: Challenge
Your own Round 1 position is at ${sessionDir}/deliberation/round1/${selfName}.md — read it first; it is YOUR prior work.
${otherName}'s position is at ${sessionDir}/deliberation/round1/${otherName}.md — read it next.

The tension under examination: ${tension}

Respond using your Challenge format:
- Summarize their position
- State: Maintain, Modify, or Defer
- Your reasoning (1 paragraph)

Save the FULL response to ${sessionDir}/deliberation/round2/${selfName}-responds-to-${otherName}.md
and return the structured summary.${scribeNote}`,
          { agentType: m.agentType, model: challengeModel || m.model, label: `R2:${selfName}->${otherName}`, phase: 'Challenge', schema: CHALLENGE_SCHEMA })
      }),
  )).filter(Boolean)
}

// ---- Round 3: Converge (parallel, all members) ----
phase('Converge')
const exchangeSummary = challenges.length
  ? challenges.map((c) => `- ${c.agent}: ${c.stance} — ${c.summary}`).join('\n')
  : '(no tension pairs were challenged this session)'
const finals = (await parallel(roster.map((m) => () =>
  agent(`${identityBlock(m)}

## Round 3: Converge
Your Round 1 position is at ${sessionDir}/deliberation/round1/${m.name}.md — read it first; it is YOUR prior work.

Here is what happened in the Challenge round:
${exchangeSummary}

Write your final position using your Converge format:
- Revised recommendation
- Concessions made and why
- Non-negotiables
- Implementation notes

Save the FULL final position to ${sessionDir}/deliberation/round3/${m.name}.md
and return the structured summary.${scribeNote}`,
    { agentType: m.agentType, model: m.model, label: `R3:${m.name}`, phase: 'Converge', schema: CONVERGE_SCHEMA }),
))).filter(Boolean)
log(`Round 3 complete: ${finals.length}/${roster.length} final positions`)

// ---- Synthesis: write design.md, return only the structured payload ----
phase('Synthesis')
const synthesis = await agent(`You are the deliberation conductor synthesizing the unified Design Document.

Read ALL files under ${sessionDir}/deliberation/round3/ (and round1/round2 for
context where positions shifted). The idea: ${idea}

Write the Design Document to ${sessionDir}/design.md with exactly these sections:
# Design Document: <Idea>
## Overview (1-2 paragraph executive summary)
## Architecture / ## User Experience / ## Risk Assessment / ## Quality Strategy
   (one section per participating perspective: ${roster.map((m) => m.name).join(', ')})
## Tension Resolutions (table: Tension | Agents | Resolution | Reasoning)
## Decision Log (table: Decision | Options Considered | Chosen | Reasoning)

Return the structured payload mirroring the two tables — the conductor presents
your payload to the user without re-reading the file.${scribeNote}`,
  { label: 'Synthesis', phase: 'Synthesis', schema: SYNTHESIS_SCHEMA })

if (budget.total) log(`Token budget: ${budget.spent()} spent of ${budget.total}`)

return {
  pairs: validPairs,
  positions: positions.map((p) => ({ agent: p.agent, summary: p.summary })),
  finals: finals.map((f) => ({ agent: f.agent, summary: f.summary, nonNegotiables: f.nonNegotiables || [] })),
  ...synthesis,
}
