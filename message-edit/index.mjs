import { SessionLogOffset } from "@deepseek-ai/dsh-session";
//#region src/shared.ts
/** Same-origin endpoint owned by the Edit & Resend host plugin. */
const EDIT_RESEND_PATH = "/edit-resend";
//#endregion
//#region src/host.ts
/** Stable Cordis plugin name. */
const name = "edit-resend";
/** Public services used by the edit transaction and last-message projection. */
const inject = [
	"sessions",
	"agents",
	"sessionQuery",
	"workspaceRegistry",
	"webServer"
];
function isTextualBlock(block) {
	return block?.type === "text" || block?.type === "reasoning";
}
function cloneUser(message, content = structuredClone(message.content)) {
	return Object.freeze({
		id: crypto.randomUUID(),
		role: "user",
		content: Object.freeze(content),
		source: Object.freeze({ kind: "user" })
	});
}
function replaceTextBlock(content, blockIndex, text) {
	const block = content[blockIndex];
	if (!isTextualBlock(block)) throw new Error("所选内容块不是可编辑文本。");
	return content.map((candidate, index) => index === blockIndex ? {
		...candidate,
		text
	} : structuredClone(candidate));
}
/** Fold complete turn brackets plus the optional still-open tail turn. */
function foldTurns(events) {
	const closed = [];
	let current;
	for (const event of events) {
		if (event.type === "turn/start") {
			if (current !== void 0) {}
			current = {
				turn: event.data.turn,
				startSeq: event.seq,
				assistants: []
			};
			continue;
		}
		if (current === void 0) continue;
		if (event.type === "user/message" && current.user === void 0 && event.data.source.kind === "user") {
			current.user = event;
			continue;
		}
		if (event.type === "assistant/message" && event.data.turn === current.turn) {
			current.assistants.push(event);
			continue;
		}
		if (event.type === "turn/end" && event.data.turn === current.turn) {
			closed.push({
				...current,
				endSeq: event.seq
			});
			current = void 0;
		}
	}
	if (current !== void 0 && (current.user !== void 0 || current.assistants.length > 0)) return {
		closed,
		open: { ...current }
	};
	return { closed };
}
function editableMessages(closed, open) {
	const result = [];
	const pushUser = (event, turnNumber, openFlag) => {
		for (const [blockIndex, block] of event.data.content.entries()) {
			if (block.type !== "text") continue;
			result.push({
				key: String(event.seq) + ":" + String(blockIndex),
				turn: turnNumber,
				eventSeq: event.seq,
				blockIndex,
				kind: "user",
				text: block.text,
				time: event.time,
				...openFlag ? { open: true } : {}
			});
		}
	};
	for (const turn of closed) if (turn.user !== void 0) pushUser(turn.user, turn.turn, false);
	if (open !== void 0) {
		if (open.user !== void 0) pushUser(open.user, open.turn, true);
	}
	return result;
}
/** Reject stale targets on the server, not merely by hiding their buttons. */
function planOperation(operation, events) {
	if (operation.action !== "edit" || operation.cascade !== "truncate") throw new TypeError("Only last-message editing is supported.");
	const { closed, open } = foldTurns(events);
	const latest = [...closed, ...open ? [open] : []].findLast((turn) => turn.user !== void 0);
	if (!latest?.user || latest.user.seq !== operation.eventSeq) throw new TypeError("The last message changed. Reopen the editor.");
	if (!operation.text.trim()) throw new TypeError("Message cannot be empty.");
	if (latest.user.data.content[operation.blockIndex]?.type !== "text") throw new TypeError("Only user text can be edited.");
	return {
		boundary: latest.startSeq - 1,
		queuedUsers: [cloneUser(latest.user.data, replaceTextBlock(latest.user.data.content, operation.blockIndex, operation.text))]
	};
}
/** Public read lease supports both live and persisted seeded sessions. */
async function readEvents(ctx, sessionId) {
	const observation = await ctx.sessionQuery.observeSession(sessionId, { projectionMode: "none" });
	try {
		return structuredClone([...observation.events]);
	} finally {
		observation[Symbol.dispose]();
	}
}
function agentOptions(events, fallback) {
	const config = events.findLast((event) => event.type === "request/header")?.data.header.config;
	const provider = config?.provider ?? fallback?.provider;
	const model = config?.model ?? fallback?.model;
	if (provider === void 0 || provider.length === 0 || model === void 0 || model.length === 0) throw new Error("无法从会话历史解析模型路由。");
	const maxTokens = config?.maxTokens ?? fallback?.maxTokens;
	return {
		provider,
		model,
		...maxTokens === void 0 ? {} : { maxTokens }
	};
}
async function withSourceAgent(ctx, sessionId, operation, job) {
	let handle;
	let agent = ctx.agents.get(sessionId);
	if (agent === void 0) {
		const events = await readEvents(ctx, sessionId);
		handle = await ctx.agents.resume({
			resumeSessionId: sessionId,
			agentOptions: agentOptions(events)
		});
		agent = handle.agent;
	}
	try {
		planOperation(operation, agent.session.snapshotEvents());
		if (agent.status === "idle") return await agent.runMaintenance(async () => job(agent));
		agent.cancel({ kind: "user" });
		await agent.whenIdle();
		return await agent.runMaintenance(async () => job(agent));
	} finally {
		await handle?.dispose();
	}
}
function inheritedSeed(source, boundary) {
	if (boundary === -1) return [];
	const events = source.snapshotEvents();
	const boundaryEvent = events[boundary];
	if (boundary < 0 || boundaryEvent === void 0 || boundaryEvent.seq !== boundary) throw new Error("分支边界不是连续会话事件。");
	return events.slice(0, boundary + 1);
}
function sessionPreset(session) {
	const header = session.header;
	if (header.agentPreset !== void 0) return header.agentPreset;
	const events = session.snapshotEvents();
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === "agent-preset/selected" && event.data?.agentPreset !== void 0) return event.data.agentPreset;
	}
}
async function createVersionAgent(ctx, source, childId, plan, options) {
	const events = inheritedSeed(source, plan.boundary);
	const presets = ctx.get("agentPresets");
	const presetId = sessionPreset(source);
	let agentPreset;
	let setup;
	if (presets !== void 0 && presetId !== void 0) {
		const resolved = (await presets.resolve(presetId)).id;
		agentPreset = resolved;
		setup = async (agentCtx) => {
			await presets.mount(agentCtx, resolved);
		};
	}
	const child = await ctx.agents.create({
		sessionId: childId,
		seed: events,
		inheritedEventCount: SessionLogOffset(events.length),
		meta: {
			...source.header.cwd === void 0 ? {} : { cwd: source.header.cwd },
			parentSession: source.id,
			isSeeded: true,
			...agentPreset === void 0 ? {} : { agentPreset }
		},
		agentOptions: options,
		...setup === void 0 ? {} : { setup }
	});
	try {
		await ctx.sessions.flush(child.agent.session);
		return child;
	} catch (error) {
		await child.dispose();
		throw error;
	}
}
function sourceWorkspace(ctx, sessionId) {
	return ctx.workspaceRegistry.list().find((workspace) => workspace.sessionIds.includes(sessionId));
}
async function recoverOperation(inverses) {
	const failures = [];
	for (const inverse of inverses.reverse()) try {
		await inverse();
	} catch (error) {
		failures.push(error);
	}
	if (failures.length > 0) throw new AggregateError(failures, "版本操作恢复失败。");
}
/** Best-effort: carry the source session's title over to the new version. */
async function inheritTitle(ctx, sourceId, childSession) {
	const sessionTitle = ctx.get("sessionTitle");
	if (sessionTitle === void 0) return;
	const snapshot = await ctx.sessionQuery.readTitle(sourceId);
	if (snapshot?.title != null && snapshot.title.trim().length > 0) sessionTitle.rename(childSession, snapshot.title);
}
async function runOperation(ctx, operation) {
	const sourceId = sessionIdOf(operation.sessionId);
	return withSourceAgent(ctx, sourceId, operation, async (source) => {
		const childId = sessionIdOf("session-" + crypto.randomUUID());
		const inverses = [];
		try {
			const events = source.session.snapshotEvents();
			const plan = planOperation(operation, events);
			const options = agentOptions(events, source.options);
			const child = await createVersionAgent(ctx, source.session, childId, plan, options);
			inverses.push(() => child.dispose());
			child.agent.inbox.clear();
			const workspace = sourceWorkspace(ctx, sourceId);
			if (workspace !== void 0) {
				await workspace.attachSession(childId);
				inverses.push(() => workspace.detachSession(childId));
			}
			for (const message of plan.queuedUsers) child.agent.followup(message);
			inverses.length = 0;
			return {
				sessionId: childId,
				queuedTurns: plan.queuedUsers.length
			};
		} catch (error) {
			try {
				await recoverOperation(inverses);
			} catch (recoveryError) {
				throw new AggregateError([error, recoveryError], "版本操作及其恢复均失败。");
			}
			throw error;
		}
	});
}
/**
* Post-edit finalization, run OFF the request's critical path: inherit the
* source title and archive (soft-delete) the previous version so the sidebar
* keeps a single conversation. Fire-and-forget; failures only warn.
*/
async function finalizeEdit(ctx, sourceId, childId) {
	try {
		const childSession = ctx.agents.get(childId)?.session;
		if (childSession !== void 0) await inheritTitle(ctx, sourceId, childSession);
	} catch (error) {
		ctx.logger.warn("edit-resend: inherit title failed: " + (error instanceof Error ? error.message : String(error)));
	}
	try {
		await ctx.workspaceRegistry.archiveSession(sourceId);
	} catch (error) {
		ctx.logger.warn("edit-resend: archive source failed: " + (error instanceof Error ? error.message : String(error)));
	}
}
async function timeline(ctx, sessionId) {
	const events = ctx.agents.get(sessionId)?.session.snapshotEvents() ?? await readEvents(ctx, sessionId);
	const { closed, open } = foldTurns(events);
	const users = editableMessages(closed, open).filter((message) => message.kind === "user");
	const latestSeq = events.findLast((event) => event.type === "user/message" && event.data.source.kind === "user")?.seq;
	return {
		sessionId,
		messages: users.filter((message) => message.eventSeq === latestSeq)
	};
}
function objectValue(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("请求体必须是 JSON 对象。");
	return value;
}
function sessionIdOf(value) {
	if (typeof value !== "string" || value.length === 0) throw new TypeError("sessionId 必须是非空字符串。");
	return value;
}
function integerOf(value, name) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(name + " 必须是非负安全整数。");
	return value;
}
function cascadeOf(value) {
	if (value !== "truncate") throw new TypeError("cascade 必须是 truncate 或 preserve。");
	return value;
}
function decodeOperation(value) {
	const record = objectValue(value);
	const sessionId = sessionIdOf(record["sessionId"]);
	switch (record["action"]) {
		case "edit":
			if (typeof record["text"] !== "string") throw new TypeError("text 必须是字符串。");
			return {
				action: "edit",
				sessionId,
				eventSeq: integerOf(record["eventSeq"], "eventSeq"),
				blockIndex: integerOf(record["blockIndex"], "blockIndex"),
				text: record["text"],
				cascade: cascadeOf(record["cascade"])
			};
		default: throw new TypeError("action 必须是 edit、reroll 或 retry。");
	}
}
function requestJson(request) {
	return new Promise((resolve, reject) => {
		const decoder = new TextDecoder();
		let text = "";
		request.on("data", (chunk) => {
			text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
		});
		request.on("end", () => {
			try {
				text += decoder.decode();
				resolve(JSON.parse(text));
			} catch (error) {
				reject(error);
			}
		});
		request.on("error", reject);
	});
}
function respondJson(response, status, value) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(value));
}
async function handleRoute(ctx, request, response) {
	try {
		if (request.method === "GET") {
			respondJson(response, 200, await timeline(ctx, sessionIdOf(new URL(request.url ?? "/edit-resend", "http://edit-resend.local").searchParams.get("sessionId"))));
			return;
		}
		if (request.method === "POST") {
			const operation = decodeOperation(await requestJson(request));
			const result = await runOperation(ctx, operation);
			finalizeEdit(ctx, sessionIdOf(operation.sessionId), sessionIdOf(result.sessionId));
			respondJson(response, 200, result);
			return;
		}
		response.writeHead(405);
		response.end();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		respondJson(response, error instanceof TypeError ? 400 : 409, { error: message });
	}
}
/** Register the reversible route contribution. */
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: EDIT_RESEND_PATH,
		handler: (request, response) => handleRoute(ctx, request, response)
	}), "edit-resend: HTTP route");
}
//#endregion
export { apply, foldTurns, inject, name, planOperation, readEvents };
