# Son of Anton Design Research for a VS Code–Based Agentic IDE

## Product intent and success criteria

Your stated ambition—an end-to-end “agentic coding experience” inside an IDE forked from the open-source VS Code codebase—matches a clear industry trend: IDEs and terminals are shifting from “assistive autocomplete” to systems that can plan, change multiple files, run commands, validate results, and present reviewable patches. Claude Code explicitly positions itself as an agentic coding tool that can read a codebase, edit files, and run commands, across terminal and IDE surfaces. citeturn1search0turn1search6 OpenAI similarly positions Codex as a software engineering agent (cloud and local variants), capable of writing features, fixing bugs, and proposing PRs in sandboxed environments. citeturn1search3turn1search1 Cursor frames its Agent mode as autonomous, including terminal command execution and multi-file editing. citeturn1search8turn1search12 Google Antigravity is described as “agent-first,” emphasizing multi-agent management and “Artifacts” aimed at making work easier to verify. citeturn3news35turn3search3

For a personal project, the sharpest definition of “end-to-end” is: **task-in → patch-out → verified-run**, without leaving the IDE. That implies a loop that (a) assembles context, (b) plans, (c) executes changes (files + commands), (d) runs tests/builds or other checks, (e) presents a review UX, and (f) records the outcome into durable memory. Several modern tools converge on that loop: VS Code’s “agents” documentation describes local agent sessions (Ask/Plan/Agent) plus background agents that run in Git worktrees, and cloud agents that return PR-style outputs. citeturn6search7

A practical success metric set for Son of Anton is therefore less about “best model” and more about **repeatability, controllability, and transparency**: the user can see what context was used, what tools ran, what changed, how much it cost, and how to roll it back. Requests for more in-the-moment context transparency (before the run finishes) are recurring in VS Code/Copilot issue discussions, and are a good proxy for what power users feel is missing. citeturn6search6turn6search2

## Forking VS Code responsibly

VS Code the product is a Microsoft-licensed distribution of the MIT-licensed Code OSS repository, and Microsoft documents that separation explicitly: Code OSS is MIT, while the branded distribution includes Microsoft-specific assets/customizations under separate product terms. citeturn0search4turn0search31turn0search0 This matters because it constrains what you can ship in a fork, and it also intersects with extensions.

A key, repeatedly cited ecosystem constraint is the **marketplace**: the Visual Studio Marketplace terms restrict marketplace offerings to “Visual Studio Products and Services,” which is why community builds like VSCodium default to Open VSX instead of the Microsoft marketplace. citeturn0search3turn0search6 Open VSX is operated as an Eclipse open-source project and is positioned as a vendor-neutral alternative marketplace for VS Code extensions. citeturn0search2turn0search10 This implies a strategic fork decision:

- If Son of Anton should feel like “real VS Code” (extensions, themes, settings), you probably want Code OSS compatibility and Open VSX support out of the box, similar to other forks and tools (including Kiro, which publicly states Open VSX plugin and VS Code settings compatibility, and that it’s built on Code OSS). citeturn3search1turn3search0  
- If you ever distribute binaries beyond purely personal use, you’ll want a clean approach to marketplace integration and trademarked assets, because the “drop-in replacement” route (proxying Microsoft endpoints) is controversial and has been characterized as violating the intent of marketplace restrictions. citeturn0search20turn0search1

If you also want Son of Anton to be “powerful but safe,” it’s worth noting a second-order effect of Open VSX reliance: security researchers have warned that VS Code forks can inherit recommendation lists from Microsoft’s marketplace that point to extensions that don’t exist in Open VSX—creating namespace-squatting and supply-chain risk when attackers publish lookalike/malicious extensions to fill the gap. citeturn0search32turn0search9 Treat “extension discovery” and “recommended extensions” as part of your threat model, not just UX polish.

## Feature harvest from today’s tools

The most robust path to “best of everything” is to treat each product as a set of validated interaction patterns, not as one monolithic UX to imitate. Below are the highest-signal features to borrow, grounded in what vendors document they actually built and shipped.

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["VS Code editor screenshot","Cursor agent mode screenshot","Claude Code VS Code extension screenshot","Google Antigravity IDE screenshot","Kiro IDE screenshot","Zed editor collaboration screenshot","Warp terminal blocks screenshot"],"num_per_query":1}

**VS Code core strengths to preserve**
VS Code’s extensibility model (extension points, language servers, debug adapters) is the backbone that makes a fork viable as an “IDE platform” rather than a one-off editor. Debug Adapter Protocol (DAP) is documented as an abstract protocol between an editor/IDE and a debugger, and VS Code’s language server guide describes language servers as extensions that power completion, diagnostics, and navigation. citeturn5search5turn5search17 VS Code also ships “Workspace Trust,” which explicitly gates code execution and extension behavior when a folder is untrusted—this concept becomes even more critical once you add an autonomous agent that wants to run commands and modify files. citeturn5search2turn5search14

**Claude Code’s strongest patterns**
Claude Code is directly framed as agentic: it reads the codebase, edits files, runs commands, and integrates with dev tools. citeturn1search0turn1search2 Its permissions model is unusually explicit: allow/ask/deny rules for tools and commands, managed through a dedicated permissions workflow. citeturn1search2 Anthropic also emphasizes IDE integration with real-time diffs in a sidebar and “checkpoints for autonomous operation,” which maps neatly onto the “review-first” safety approach you want in an IDE. citeturn1search6

**OpenAI Codex’s strongest patterns**
Codex spans cloud and local. OpenAI’s “Introducing Codex” describes a cloud agent where tasks run in their own sandbox environments preloaded with the repository, and can operate in parallel. citeturn1search3 On the local side, Codex CLI is described as a coding agent you can run locally, able to read/change/run code in a selected directory; it’s open source and built in Rust. citeturn1search1turn1search5 Your IDE can borrow two key ideas that appear repeatedly in Codex materials: (a) **isolated execution contexts** for tasks, and (b) **centralized diff review** across multiple agent runs (especially for long-horizon tasks). citeturn1news37turn1search7

**Cursor’s strongest patterns**
Cursor’s docs position “Agent” as capable of complex tasks, running terminal commands, and editing code, with explicit “modes” including a default mode for complex tasks. citeturn1search8turn1search12 Cursor also highlights parallelization via Git worktrees/remote machines to run multiple agents without interference—an important scaling pattern for “many tasks at once” while staying reviewable. citeturn1search18 Cursor “Hooks” are particularly worth stealing: they provide an explicit extension point to observe/control/extend the agent loop via scripts, which can become Son of Anton’s way of integrating with linters, test runners, policy checks, and custom workflows. citeturn1search21

**Google Antigravity’s strongest patterns**
Antigravity is pitched as “mission control” for autonomous agents, with a distinct manager surface for overseeing multiple agents. citeturn3search3turn3news35 The standout concept is **Artifacts**—task lists, plans, screenshots, and browser recordings—intended to make verification easier than raw tool-call logs. citeturn3news35 That maps well to your “powerful but funny” goal because it encourages “show your work” behavior, which you can style with Anton-esque commentary without letting the system become unserious about correctness.

**Kiro’s strongest patterns**
Kiro is explicit about being built on Code OSS, compatible with VS Code settings and Open VSX plugins, and it emphasizes spec-driven development plus MCP support and hooks. citeturn3search1turn3search0 Kiro also advertises “autopilot mode,” per-prompt credit usage visibility, image-based guidance (“drop an image of your UI design”), and a posture of staying in control when commands/scripts are run. citeturn3search0 The “spec-first” move is strategically important: it is a partial antidote to agent chaos, and it aligns with user sentiment that agents are more useful when they plan before coding and return reviewable patches. citeturn3search1turn6search7

**JetBrains strengths to emulate (even if you can’t replicate them fully)**
JetBrains IDEs remain the benchmark for deep refactoring and semantic code understanding (built on heavy indexing). JetBrains AI Assistant emphasizes project-context code completion, “next edit suggestions,” and AI-assisted refactoring, which are UI primitives you can implement even if your underlying index is different. citeturn2search0turn2search17turn2search4 JetBrains has also publicly signaled a strategic pivot away from Fleet as a general-purpose IDE, toward “agentic development” workflows where tasks run asynchronously and return full patches—very close to your “end-to-end agentic” objective. citeturn2search5turn2news37

**Zed’s strongest patterns**
Zed makes two claims that matter for your design: (a) it is a high-performance editor with real-time multiplayer collaboration, and (b) its AI features run in a native, GPU-accelerated Rust app without an Electron layer. citeturn11search1turn2search29 You probably won’t match the performance story while staying on an Electron-based fork, but you *can* borrow Zed’s biggest interoperability idea: the **Agent Client Protocol (ACP)**. ACP is positioned as an open standard (JSON-RPC 2.0) that lets any agent integrate with an editor without custom per-agent integrations. citeturn11search0turn11search7 This is directly relevant to your plan to support Claude Code, Codex, Gemini, local models, and “whatever comes next” without re-implementing each agent.

**Warp’s strongest patterns**
Warp frames itself as an “Agentic Development Environment,” combining a modern terminal with AI agents, and it heavily leans on Blocks (grouped input/output) plus a shared knowledge surface called Warp Drive where workflows, prompts, notebooks, and environment variables can live and sync. citeturn2search3turn2search10turn11search2 For Son of Anton, the core transferable ideas are: (a) make terminal output first-class data for the agent, (b) store reusable “runbooks” as structured objects, and (c) make agent workflows navigable and searchable like code. citeturn2search13turn11search2

**Cline’s strongest patterns**
Cline positions itself as an open-source, tool-enabled coding agent and provides both a VS Code extension and a cross-platform CLI that works with multiple model providers. citeturn1search13turn1search30 Its documentation highlights “Memory Bank,” auto-approve, subagents, and MCP servers as extension points. citeturn1search13turn1search30 Even if you don’t adopt Cline’s exact UI, the provider-agnostic setup plus “human-in-the-loop approvals” is a proven pattern for personal projects that want maximal flexibility without committing to a single model vendor.

## Agent loop UX patterns you should steal

Across products, a handful of UX primitives show up repeatedly because they solve real pain:

**Worktree isolation as the default execution model**
VS Code’s own docs describe background agents operating in Git worktrees to prevent conflicts with your active work. citeturn6search7 Cursor similarly highlights worktrees for parallel agents. citeturn1search18 This pattern is worth adopting as the “Son of Anton default” for any task above trivial size: each agent task gets a worktree (or a branch + temp dir), runs commands there, and returns a patchset for review/merge.

**Plan-first → patch-second workflows**
VS Code distinguishes Plan vs Agent modes, and Kiro emphasizes specs and structured workflows (turning intent into more formal artifacts). citeturn6search7turn3search4 The user value is not “planning theater”; it’s enabling cost estimation, risk analysis, and dependency detection before code changes.

**Diff-first review UX**
Anthropic highlights “inline diffs” in its VS Code extension experience. citeturn1search6 Zed’s ACP framing also treats the IDE as the review surface that can provide multi-buffer review tooling. citeturn11search3turn11search0 This implies a strong default: the agent never silently applies major edits; every multi-file change becomes a patch you can approve, amend, or discard.

**Checkpoints and rollback that feel native**
User commentary repeatedly calls out “rollback/checkpoints” as a missing or critical feature in agentic tools, even when the core coding capability is strong. citeturn6search13 Cursor’s broader “checkpoint” idea is also visible in community discussion (and appears in other agent tools as snapshots). citeturn6search13 Practically: treat checkpoints as a first-class object (a named snapshot of worktree + test state + reasoning trace), not just “git commit somewhere.”

**Hooks everywhere**
Cursor hooks provide a clean concept: user scripts can observe/control the agent loop. citeturn1search21 Kiro also foregrounds hooks as a core capability. citeturn3search4 In Son of Anton, hooks become your “escape hatch” for everything that will differ per project: running `pytest`, calling `nx affected`, generating Prisma migrations, updating snapshots, sanity-checking infra, or enforcing org policies.

## Provider and model interoperability

To meet your requirement (“Claude Code, Codex, Gemini, Copilot credits, plus any API or local model”), you need to separate **agent UX** from **model/provider backends**.

**Adopt two interoperability standards: MCP for tools, ACP for agents**
Model Context Protocol (MCP) is explicitly an open standard for connecting AI systems to tools/data sources, and its specification emphasizes tool safety and explicit user consent before invoking tools. citeturn4search7turn4search11 ACP, developed by Zed and now co-branded with JetBrains, is positioned as a standard for connecting local/remote/in-house agents to an IDE via JSON-RPC, without vendor lock-in. citeturn11search31turn11search7 Together, these give you a clean layering:

- Son of Anton IDE = **ACP client** (can run any ACP agent: Codex CLI, Gemini CLI, Kiro CLI, etc.). citeturn11search7turn11search10  
- Son of Anton tool ecosystem = **MCP host/client** (connect to MCP servers for Git, DBs, issue trackers, browsers, etc.). citeturn4search7turn11search29

This directly reduces the “support every agent natively” burden; instead, you support the protocol(s) and let agents plug in.

**Local models via OpenAI-compatible endpoints**
Both Ollama and LM Studio publish OpenAI-compatible endpoints, explicitly to support reuse of existing OpenAI client tooling against local servers. citeturn4search0turn4search1turn4search5 This is extremely practical for your IDE: implement the OpenAI Responses/Chat/Embeddings client once, and let users point it at:
- OpenAI’s hosted API,
- LM Studio (`base_url` to localhost), or
- Ollama’s OpenAI-compat endpoints (with the caveat that Ollama documents limitations like non-stateful behavior for certain endpoints). citeturn4search0turn4search1

**Gemini integration strategy**
For Gemini, the official Gemini API provides embedding endpoints for text and code (useful for your memory store), and Google documents model and endpoint inventories in its developer docs. citeturn10search0turn10search5turn10search26 Google’s agent ecosystem also includes Gemini CLI, described as open source and featuring built-in tools, MCP support, model routing, checkpointing, and IDE integration. citeturn10search6turn10search29 This makes an ACP-first approach attractive: treat Gemini CLI as “just another agent,” rather than re-implementing Gemini’s agent loop inside your IDE.

One operational warning worth baking into your architecture: Google’s Gemini 3 guide warns about preview deprecation timelines (for example, Gemini 3 Pro Preview scheduled shutdown on March 9, 2026), which implies your provider layer must tolerate model churn and deprecation without breaking the IDE. citeturn10search12

**Using GitHub Copilot credits and “premium requests”**
GitHub documents “premium requests” and plan-based quotas, and explicitly notes that chat, agent mode, code review, coding agent, and Copilot CLI consume premium requests with usage varying by feature/model. citeturn4search18turn4search14 Importantly for your requirement, VS Code’s documentation on third-party agents states that Claude Agent and OpenAI Codex can be used inside VS Code and billed through an existing Copilot subscription (for cloud-based third-party agents). citeturn9search10

However, there’s a practical constraint: using Copilot “credits” outside GitHub-supported surfaces may require official SDKs or supported integrations. GitHub community guidance warns that reverse-engineering internal Copilot endpoints is not officially supported and can carry account or access risks. citeturn9search27 So, for Son of Anton, the safest interpretation is:
- **Support Copilot as an installed extension/plugin** (where licensing and auth flows are handled by GitHub’s official clients), or  
- **Support Copilot via official SDKs where applicable**, understanding that these SDKs are evolving and have active discussions about billing models and user-delegated billing. citeturn9search0turn9search4

## Memory retrieval and code intelligence graphs

You want embedded memory using **graph + vector + keyword search**, plus a built-in **DAG system** to represent how an app runs and what it depends on. This is feasible, but only if you keep the architecture disciplined: “memory” must be incremental, queryable, and safe from prompt injection.

**A practical embedded memory stack**
A strong local-first default is a single on-disk database that supports:
- keyword search (for “exact string / symbol / error message” recall),
- vector search (for semantic retrieval), and
- a graph layer (for relationships).

SQLite’s FTS5 is explicitly designed for full-text search via a virtual table module. citeturn7search1 For vector search inside an embedded DB, the ecosystem now includes SQLite vector extensions (for example sqlite-vector / sqlite-vec family), explicitly positioned as enabling embedded vector search in SQLite. citeturn7search6turn7search29 That gives you **keyword + vectors** locally without running a separate service.

For the **graph** component, you can implement a property graph schema in SQLite (nodes/edges tables) and then layer GraphRAG-style indexing on top: Microsoft’s GraphRAG describes a structured approach where a knowledge graph is extracted, organized into communities, summarized, and then used to augment retrieval. citeturn7search4turn7search0 This maps well to “IDE memory” because codebases naturally form graphs (imports, call graphs, build dependencies, ownership, test coverage links).

If you want to align with modern agent ecosystems, you can expose this memory via an MCP server. There are already MCP “memory servers” that describe themselves as graph-based persistent memory for coding agents, which indicates the pattern is emerging. citeturn6search3

**What should go into memory (so it actually helps)**
The biggest mistake in agent memory is storing chat transcripts and hoping embeddings magically make it useful. A better approach is to store *artifacts*:
- Verified build/run commands for the repo (including OS-specific variants),
- Dependency extraction results (lockfiles parsed, toolchain versions),
- Resolved “how to reproduce” steps for bugs,
- Architectural summaries tied to concrete code symbols,
- Past patches (diffs) with outcomes (tests passed, benchmarks, etc.).

This aligns with Antigravity’s “Artifacts” idea: store things that are easy for humans to verify and reuse. citeturn3news35turn3search3 It also aligns with Warp Drive’s “save workflows/prompts/notebooks/env vars” concept—persistent, reusable developer objects rather than endless chat logs. citeturn11search2turn2search36

**The DAG system: make it real, not decorative**
To help the AI understand “what dependencies are required for the application to run,” you want at least two DAGs:

- **Build/dependency DAG** (what must exist / be installed / be built)
- **Task DAG** (what commands must run, in what order, under what environment)

There are proven sources of truth you can mine. Bazel documentation explicitly defines the dependency graph over targets as a DAG. citeturn8search0 Gradle documents that tasks form a DAG across projects and that Gradle constructs a task graph prior to execution. citeturn8search1 Nx documents a “Project Graph” and a separate “Task Graph” derived from it, explicitly using the graphs to decide what tasks to run and when caching can apply. citeturn8search2 For Rust, Cargo provides `cargo metadata`, which outputs JSON including resolved dependencies—ideal for IDE tooling. citeturn8search3

The practical pattern for Son of Anton is:
- Detect the build ecosystem(s) in the repo (Node, Python, Rust, JVM, Bazel/Nx, etc.).
- Run the ecosystem’s graph/metadata command in a sandboxed way.
- Normalize outputs into a unified graph schema (“targets,” “tasks,” “artifacts,” “env requirements,” “ports,” “services,” “migrations”).
- Use the graph as both (a) a UI explorer and (b) a context provider to agents (so they stop guessing how to run the app).

## Security and trust boundaries

Agentic IDEs expand the attack surface dramatically because they connect three historically separate things: (1) untrusted text (files, READMEs, issues), (2) tooling APIs (MCP servers, terminals, browsers), and (3) execution privileges (running commands that mutate the system). VS Code’s Workspace Trust exists precisely because many IDE features can execute code automatically; it treats “restricted mode” as a necessary layer when opening untrusted folders. citeturn5search2

Recent security reporting has gone further: the “IDEsaster” class of vulnerabilities has been described as prompt injection plus legacy IDE features enabling data exfiltration and, in some cases, remote code execution across multiple AI-enhanced development tools. citeturn12search5turn12search8 Separately, MCP-specific research highlights “tool poisoning” risks, where malicious instructions can be hidden in tool descriptions and exploited because users may not see or review full tool metadata. citeturn12search2turn12search3 The MCP specification itself emphasizes that tools represent arbitrary code execution and that hosts should obtain explicit user consent before invoking tools. citeturn4search11

For Son of Anton, “security” is not a bolt-on; it’s the foundation that keeps the project enjoyable rather than terrifying. A research-grounded approach looks like this:

- **Treat every external input as hostile** (repo files, pasted logs, URLs, MCP server tool descriptions) unless explicitly trusted. citeturn5search2turn12search2  
- **Default to restricted mode for new workspaces**, mirroring VS Code’s trust model, and require explicit elevation for actions that can mutate the system (shell commands, package installs, network calls). citeturn5search2turn4search11  
- **Make tool permissions first-class and inspectable**, similar to Claude Code’s allow/ask/deny rule system. citeturn1search2  
- **Prefer isolated execution** for autonomous tasks (worktrees + containers/VMs) so mistakes don’t become “it wiped my drive” incidents; AI IDEs have already had publicized cases where powerful modes caused catastrophic deletions when safeguards were insufficient. citeturn3news37turn6search7  
- **Auditability by design**: persist the full “agent run record” (context inputs, tool calls, diffs, test outputs, approvals) so users can debug agent behavior and so “memory” is evidence-based rather than lore. This lines up with Artifact-style verification in Antigravity. citeturn3news35

## Opportunities and build roadmap

You asked for “a broader search on what people are missing,” beyond your already-strong list. Across community discussions and product issue trackers, the recurring gaps cluster into a few themes.

**Transparent cost and context management**
Users repeatedly ask for earlier visibility into context window usage and model limits, not after the response completes. citeturn6search2turn6search6 Real-world reporting also highlights that token costs can become a decisive “tool switch” factor, which suggests Son of Anton should treat budget/limits as an ergonomic feature, not accounting trivia. citeturn6news41 Kiro’s “per prompt credit usage” concept is directly responsive to this pain. citeturn3search0

**Reliability, offline-first, and graceful degradation**
Outages of popular coding models have become disruptive enough that developers publicly describe being forced to “code manually” during downtime, which is a blunt signal that local fallback and multi-provider routing will matter more over time. citeturn6news40 A multi-backend design (hosted + local via LM Studio/Ollama) is therefore not just a fun feature—it’s resiliency engineering. citeturn4search1turn4search0

**Review-first workflows that feel like version control**
A consistent theme in agentic workflows is that people want outputs to feel like PRs: isolated work, clear diffs, easy rollback, and structured review. VS Code’s agent docs emphasize worktree isolation for background agents; Codex and Antigravity emphasize sandboxing and artifacts; Zed’s ACP story emphasizes IDE-native multi-buffer reviews. citeturn6search7turn1search3turn11search3 Packaging agent changes as “patch objects” that live beside Git (but don’t require Git expertise) is a strong differentiator.

**Security controls that match the new trust boundary**
The IDEsaster and MCP tool-poisoning threads show that the traditional “IDE threat model” is outdated once agents can run tools. citeturn12search5turn12search2 “Secure for AI” design—explicit consent, sandboxing, provenance, and tool transparency—can be a marquee feature rather than a compliance chore.

**A pragmatic build sequence for a solo personal project**
A realistic roadmap that matches the research above:

1. **Start with a “thin fork” of Code OSS**: keep extension compatibility, implement Open VSX integration by default, and avoid ecosystem lock-in risks early. citeturn0search3turn0search4  
2. **Implement the agent runtime as a first-party “core extension”** inside the fork: this keeps iteration fast while preserving VS Code’s architecture boundaries (extension host, task system, terminal integration). citeturn5search28turn5search4  
3. **Adopt ACP as the multi-agent bridge**: integrate at least one external agent via ACP (Gemini CLI, Codex CLI, or Kiro CLI) to prove the protocol-first approach. citeturn11search7turn11search10turn11search27  
4. **Adopt MCP as the tools bridge**: focus on a minimal safe tool set first (read-only file search, repo search, build/test runners), with explicit consent and auditing. citeturn4search11turn11search29  
5. **Ship the memory substrate** (SQLite FTS5 + vector + graph tables), and expose it as a context source and as user-facing search. citeturn7search1turn7search29  
6. **Ship the DAG explorer** by integrating real dependency/task graphs from at least two ecosystems (for example: Cargo + Nx or Gradle), then expand. citeturn8search3turn8search2turn8search1  
7. **Harden the trust model** (workspace restricted mode by default + permissions UI + sandboxed execution options) before adding “turbo/autopilot.” citeturn5search2turn1search2turn3news37

Finally, the “Son of Anton” personality layer: keep it opt-in and keep it honest. The show reference to entity["tv_show","Silicon Valley","hbo comedy series"] and its fictional AI entity["fictional_character","Anton","silicon valley ai"] gives you a tone anchor, but the research trend is clear: as tools become more autonomous, developers want *more* visibility, not less. A witty agent that also produces meticulous artifacts, diffs, and receipts is the sweet spot—funny, but never vague. citeturn3news35turn6search6