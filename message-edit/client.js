window.__ModuleLoader__.load({
	id: "dsh-message-edit-local",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/shared.ts
		/** Same-origin endpoint owned by the Edit & Resend host plugin. */
		const EDIT_RESEND_PATH = "/edit-resend";
		//#endregion
		//#region src/client/controller.ts
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function objectValue(value, label) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(label + " 不是对象");
			return value;
		}
		function stringValue(value, label) {
			if (typeof value !== "string") throw new TypeError(label + " 不是字符串");
			return value;
		}
		function numberValue(value, label) {
			if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(label + " 不是数字");
			return value;
		}
		function booleanValue(value, label) {
			if (typeof value !== "boolean") throw new TypeError(label + " 不是布尔值");
			return value;
		}
		function blockKind(value) {
			if (value !== "user") throw new TypeError("消息块类型无效");
			return value;
		}
		function decodeMessage(value, index) {
			const row = objectValue(value, "messages[" + String(index) + "]");
			return {
				key: stringValue(row["key"], "消息 key"),
				turn: numberValue(row["turn"], "消息 turn"),
				eventSeq: numberValue(row["eventSeq"], "消息 eventSeq"),
				blockIndex: numberValue(row["blockIndex"], "消息 blockIndex"),
				kind: blockKind(row["kind"]),
				text: stringValue(row["text"], "消息 text"),
				time: numberValue(row["time"], "消息 time"),
				...row["open"] === void 0 ? {} : { open: booleanValue(row["open"], "消息 open") }
			};
		}
		function arrayValue(value, label) {
			if (!Array.isArray(value)) throw new TypeError(label + " 不是数组");
			return value;
		}
		function decodeTimeline(value) {
			const data = objectValue(value, "Timeline 响应");
			return {
				sessionId: stringValue(data["sessionId"], "Timeline sessionId"),
				messages: arrayValue(data["messages"], "Timeline messages").map(decodeMessage)
			};
		}
		function decodeOperationResult(value) {
			const data = objectValue(value, "操作响应");
			return {
				sessionId: stringValue(data["sessionId"], "操作 sessionId"),
				queuedTurns: numberValue(data["queuedTurns"], "操作 queuedTurns")
			};
		}
		async function responseValue(response) {
			const value = await response.json();
			if (response.ok) return value;
			const error = objectValue(value, "错误响应")["error"];
			throw new Error(typeof error === "string" ? error : "请求失败：HTTP " + String(response.status));
		}
		/**
		* Refresh key: only the running flag and the highest completed turn move the
		* host projection. History paging (older turns, hasMore/removed/openState) does
		* NOT change the host-side full-log result, so it must not trigger a refetch.
		*/
		function conversationRevision(snapshot) {
			return (snapshot.running ? "R" : "r") + ":" + String(snapshot.queue.length);
		}
		var EditResendController = class {
			sessionId;
			store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
				status: "idle",
				error: null,
				pending: null,
				timeline: null
			});
			face;
			generation = 0;
			sessions;
			sessionSource;
			sessionSourceDispose;
			sessionRevision;
			refreshScheduled = false;
			observing = false;
			navigationWaits = /* @__PURE__ */ new Set();
			constructor(ctx, sessionId) {
				this.sessionId = sessionId;
				this.sessions = ctx.get("sessions");
				this.face = {
					hooks: { editResend: this.store },
					load: () => {
						this.load();
					},
					edit: (message, text, cascade) => this.mutate({
						action: "edit",
						sessionId: this.sessionId,
						eventSeq: message.eventSeq,
						blockIndex: message.blockIndex,
						text,
						cascade
					})
				};
				ctx.effect(() => this.observeDependencies(), "edit-resend: observe " + sessionId);
			}
			observeDependencies() {
				this.observing = true;
				this.bindSessionSource();
				const disposeList = this.sessions.list.subscribe(() => {
					if (this.bindSessionSource()) this.invalidate();
				});
				return () => {
					this.observing = false;
					this.generation += 1;
					disposeList();
					this.sessionSourceDispose?.();
					this.sessionSourceDispose = void 0;
					this.sessionSource = void 0;
					this.sessionRevision = void 0;
					for (const cancel of [...this.navigationWaits]) cancel();
				};
			}
			bindSessionSource() {
				const source = this.sessions.binding(this.sessionId)?.session;
				if (source === this.sessionSource) return false;
				this.sessionSourceDispose?.();
				this.sessionSource = source;
				this.sessionRevision = source === void 0 ? void 0 : conversationRevision(source.getSnapshot());
				this.sessionSourceDispose = source?.subscribe(() => {
					if (this.sessionSource !== source) return;
					const revision = conversationRevision(source.getSnapshot());
					if (revision === this.sessionRevision) return;
					this.sessionRevision = revision;
					this.invalidate();
				});
				return true;
			}
			invalidate() {
				if (!this.observing || this.store.getSnapshot().status === "idle" || this.refreshScheduled) return;
				this.refreshScheduled = true;
				setTimeout(() => {
					this.refreshScheduled = false;
					if (this.observing && this.store.getSnapshot().status !== "idle") this.load();
				}, 200);
			}
			async load() {
				const generation = ++this.generation;
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					const timeline = decodeTimeline(await responseValue(await fetch("/edit-resend?sessionId=" + encodeURIComponent(this.sessionId), {
						method: "GET",
						headers: { accept: "application/json" },
						cache: "no-store"
					})));
					if (generation !== this.generation) return;
					this.store.update((state) => {
						state.status = "ready";
						state.error = null;
						state.timeline = timeline;
					});
				} catch (error) {
					if (generation !== this.generation) return;
					this.store.update((state) => {
						state.status = "error";
						state.error = messageOf(error);
					});
				}
			}
			refreshIfLoaded() {
				if (this.store.getSnapshot().status !== "idle") this.load();
			}
			async mutate(operation) {
				const current = this.store.getSnapshot();
				if (current.pending !== null || current.status !== "ready") return {
					ok: false,
					error: "时间线尚未就绪，请稍候再试。"
				};
				this.store.update((state) => {
					state.pending = operation.action;
					state.error = null;
				});
				try {
					const result = decodeOperationResult(await responseValue(await fetch(EDIT_RESEND_PATH, {
						method: "POST",
						headers: {
							accept: "application/json",
							"content-type": "application/json"
						},
						body: JSON.stringify(operation)
					})));
					this.store.update((state) => {
						state.pending = null;
					});
					await this.openWhenListed(result.sessionId);
					return { ok: true };
				} catch (error) {
					const message = messageOf(error);
					this.store.update((state) => {
						state.pending = null;
						state.error = message;
					});
					return {
						ok: false,
						error: message
					};
				}
			}
			openWhenListed(sessionId) {
				if (this.sessions.list.getSnapshot().byId[sessionId] !== void 0) {
					this.sessions.open(sessionId);
					return Promise.resolve();
				}
				return new Promise((resolve) => {
					let settled = false;
					let dispose = () => {};
					const finish = (open) => {
						if (settled) return;
						settled = true;
						dispose();
						this.navigationWaits.delete(cancel);
						if (open) this.sessions.open(sessionId);
						resolve();
					};
					const cancel = () => {
						finish(false);
					};
					this.navigationWaits.add(cancel);
					dispose = this.sessions.list.subscribe(() => {
						if (this.sessions.list.getSnapshot().byId[sessionId] === void 0) return;
						finish(true);
					});
					if (this.sessions.list.getSnapshot().byId[sessionId] !== void 0) finish(true);
				});
			}
		};
		//#endregion
		//#region \0dsh-css:/private/tmp/dsh-message-edit-clean/message-edit/src/client/InlineEdit.module.css.mjs
		const css = ".K9zO6G_panel,.K9zO6G_input,.K9zO6G_footer,.K9zO6G_actions,.K9zO6G_save,.K9zO6G_cancel,.K9zO6G_iconButton{box-sizing:border-box}.K9zO6G_iconButton{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}.K9zO6G_iconButton:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.K9zO6G_panel{background:var(--dsw-specific-bubble);width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;flex-direction:column;gap:12px;padding:14px 16px;display:flex}.K9zO6G_input{width:100%;min-height:44px;max-height:360px;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));resize:none;background:0 0;border:none;border-radius:0;padding:0;overflow-y:auto}.K9zO6G_input:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}.K9zO6G_footer{justify-content:flex-end;align-items:center;gap:12px;display:flex}.K9zO6G_hint{color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px}.K9zO6G_actions{flex:none;align-items:center;gap:12px;display:flex}.K9zO6G_save,.K9zO6G_cancel{cursor:pointer;border-radius:17px;justify-content:center;align-items:center;height:34px;padding:0 16px;font-size:14px;line-height:20px;transition:background .15s;display:inline-flex}.K9zO6G_save{background:var(--dsw-alias-button-primary-fill);min-width:92px;color:var(--dsw-alias-label-primary-foreground);border:none}.K9zO6G_save:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.K9zO6G_save:disabled{opacity:.4;cursor:not-allowed}.K9zO6G_cancel{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:0 0}.K9zO6G_cancel:hover{background:var(--dsw-alias-interactive-bg-hover)}.K9zO6G_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;margin:0;padding:8px 10px;font-size:12px;line-height:18px}";
		const tagId = "dsh-message-edit-local/InlineEdit.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-message-edit-local";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var InlineEdit_module_css_default = {
			"input": "K9zO6G_input",
			"actions": "K9zO6G_actions",
			"save": "K9zO6G_save",
			"error": "K9zO6G_error",
			"cancel": "K9zO6G_cancel",
			"hint": "K9zO6G_hint",
			"footer": "K9zO6G_footer",
			"iconButton": "K9zO6G_iconButton",
			"panel": "K9zO6G_panel"
		};
		//#endregion
		//#region src/client/i18n.ts
		let locale;
		function configureLocale(value) {
			locale = value;
		}
		function useLanguage() {
			return (0, react.useSyncExternalStore)((fn) => locale.subscribe(fn), () => locale.getSnapshot().active);
		}
		const copy = {
			en: {
				edit: "Edit last message",
				hint: "The reply after this message will be replaced.",
				send: "Send",
				cancel: "Cancel",
				error: "Could not send. Please try again."
			},
			ru: {
				edit: "Редактировать последнее сообщение",
				hint: "Ответ после этого сообщения будет заменён.",
				send: "Отправить",
				cancel: "Отмена",
				error: "Не удалось отправить. Попробуйте ещё раз."
			},
			zh: {
				edit: "编辑最后一条消息",
				hint: "此消息之后的回复将被替换。",
				send: "重新发送",
				cancel: "取消",
				error: "发送失败，请重试。"
			}
		};
		function strings(language) {
			return copy[language.split("-")[0]] ?? copy.en;
		}
		//#endregion
		//#region src/client/InlineEdit.tsx
		/**
		* Message-row edit affordance: injects edit + retry icon buttons into each
		* settled (and open-tail) message's icon-actions row via a MutationObserver,
		* because the official MessageIconActions exposes no plugin slot.
		*/
		const STYLE = {
			panel: InlineEdit_module_css_default["panel"] ?? "",
			input: InlineEdit_module_css_default["input"] ?? "",
			footer: InlineEdit_module_css_default["footer"] ?? "",
			actions: InlineEdit_module_css_default["actions"] ?? "",
			iconButton: InlineEdit_module_css_default["iconButton"] ?? "",
			save: InlineEdit_module_css_default["save"] ?? "",
			cancel: InlineEdit_module_css_default["cancel"] ?? "",
			error: InlineEdit_module_css_default["error"] ?? ""
		};
		const EDIT_PATH = "M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z";
		function svgIcon(path) {
			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.setAttribute("viewBox", "0 0 16 16");
			svg.setAttribute("fill", "none");
			const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
			p.setAttribute("d", path);
			p.setAttribute("fill", "currentColor");
			svg.appendChild(p);
			return svg;
		}
		function mountEditor(block, edit, close, language, row) {
			const text = strings(language);
			const bubble = row.parentElement?.querySelector("[class*=\"_bubble\"]");
			if (!bubble) return () => {};
			const stack = bubble.parentElement;
			const originalBubbleStyle = bubble.style.display;
			const originalStackStyle = stack.getAttribute("style");
			const originalRowStyle = row.style.display;
			const panel = document.createElement("div");
			panel.className = STYLE.panel;
			panel.setAttribute("role", "group");
			panel.setAttribute("aria-label", text.edit);
			const input = document.createElement("textarea");
			input.className = STYLE.input;
			input.value = block.text;
			input.setAttribute("aria-label", text.edit);
			const footer = document.createElement("div");
			footer.className = STYLE.footer;
			const errorEl = document.createElement("p");
			errorEl.className = STYLE.error;
			errorEl.hidden = true;
			const actions = document.createElement("div");
			actions.className = STYLE.actions;
			const save = document.createElement("button");
			save.className = STYLE.save;
			save.textContent = text.send;
			const cancel = document.createElement("button");
			cancel.className = STYLE.cancel;
			cancel.textContent = text.cancel;
			actions.append(cancel, save);
			footer.append(actions);
			panel.append(input, errorEl, footer);
			bubble.style.display = "none";
			row.style.display = "none";
			stack.style.maxWidth = "100%";
			stack.style.width = "100%";
			stack.appendChild(panel);
			const autoSize = () => {
				input.style.height = "auto";
				input.style.height = Math.min(input.scrollHeight, 360) + "px";
			};
			input.addEventListener("input", autoSize);
			input.focus();
			input.setSelectionRange(input.value.length, input.value.length);
			autoSize();
			let mounted = true;
			let saving = false;
			const saveEdit = () => {
				if (saving || !input.value.trim()) return;
				saving = true;
				save.disabled = true;
				errorEl.hidden = true;
				errorEl.textContent = "";
				edit(block, input.value, "truncate").then((outcome) => {
					if (!mounted) return;
					if (outcome.ok) {
						close();
						return;
					}
					saving = false;
					save.disabled = false;
					errorEl.hidden = false;
					errorEl.textContent = outcome.error ?? text.error;
				});
			};
			const cancelEdit = () => {
				close();
			};
			const keydown = (event) => {
				if (event.isComposing || event.keyCode === 229) return;
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					close();
				}
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					event.stopPropagation();
					saveEdit();
				}
			};
			save.addEventListener("click", saveEdit);
			cancel.addEventListener("click", cancelEdit);
			input.addEventListener("keydown", keydown);
			return () => {
				mounted = false;
				save.removeEventListener("click", saveEdit);
				cancel.removeEventListener("click", cancelEdit);
				input.removeEventListener("keydown", keydown);
				input.removeEventListener("input", autoSize);
				panel.remove();
				bubble.style.display = originalBubbleStyle;
				row.style.display = originalRowStyle;
				if (originalStackStyle === null) stack.removeAttribute("style");
				else stack.setAttribute("style", originalStackStyle);
			};
		}
		function createEditorHost(edit, language) {
			let active;
			const editBlock = (block, row) => {
				active?.();
				let cleanup = () => {};
				let mounted = true;
				const close = () => {
					if (!mounted) return;
					mounted = false;
					cleanup();
					if (active === close) active = void 0;
				};
				active = close;
				try {
					cleanup = mountEditor(block, edit, close, language, row);
				} catch (error) {
					active = void 0;
					mounted = false;
					throw error;
				}
			};
			return {
				editBlock,
				dispose: () => {
					active?.();
				}
			};
		}
		function InlineEdit({ messages, edit, language }) {
			(0, react.useEffect)(() => {
				const cleanups = [];
				const editors = createEditorHost(edit, language);
				let observer;
				const sync = () => {
					const actionRows = Array.from(document.querySelectorAll("[class*=\"actions\"]"));
					const latestUser = Array.from(document.querySelectorAll("[data-chat-flow-kind=\"user\"]")).at(-1);
					const claimedEvents = /* @__PURE__ */ new Set();
					for (const row of actionRows.reverse()) {
						const isLatest = row.closest("[data-chat-flow-kind=\"user\"]") === latestUser;
						const existingEdit = row.querySelector("[data-message-edit]");
						if (existingEdit) existingEdit.hidden = !isLatest;
						if (!isLatest) continue;
						const marker = row;
						if (marker.__editResendInjected === true) {
							if (marker.__editResendEventSeq !== void 0) claimedEvents.add(marker.__editResendEventSeq);
							continue;
						}
						const text = (row.parentElement?.parentElement?.textContent ?? "").trim();
						if (text.length === 0) continue;
						const eventSeq = [...new Set(messages.filter((message) => message.kind === "user" && message.text.length > 0 && text.includes(message.text.slice(0, 24))).map((message) => message.eventSeq))].find((candidate) => !claimedEvents.has(candidate));
						if (eventSeq === void 0) continue;
						const blocks = messages.filter((message) => message.eventSeq === eventSeq && message.kind === "user");
						if (blocks.length === 0) continue;
						const previousMarker = marker.__editResendInjected;
						const previousEventSeq = marker.__editResendEventSeq;
						marker.__editResendInjected = true;
						marker.__editResendEventSeq = eventSeq;
						claimedEvents.add(eventSeq);
						const editButton = document.createElement("button");
						editButton.className = STYLE.iconButton;
						editButton.dataset.messageEdit = "true";
						editButton.setAttribute("aria-label", strings(language).edit);
						editButton.title = strings(language).edit;
						editButton.appendChild(svgIcon(EDIT_PATH));
						const editMessage = () => {
							const latest = Array.from(document.querySelectorAll("[data-chat-flow-kind=\"user\"]")).at(-1);
							if (row.closest("[data-chat-flow-kind=\"user\"]") !== latest) return;
							const block = blocks[0];
							if (block !== void 0) editors.editBlock(block, row);
						};
						editButton.addEventListener("click", editMessage);
						const lastOfficial = Array.from(row.querySelectorAll("button")).filter((button) => button !== editButton).at(-1);
						if (lastOfficial) editButton.className = lastOfficial.className;
						if (lastOfficial !== void 0) lastOfficial.insertAdjacentElement("afterend", editButton);
						else row.appendChild(editButton);
						cleanups.push(() => {
							editButton.removeEventListener("click", editMessage);
							editButton.remove();
							if (previousMarker === void 0) delete marker.__editResendInjected;
							else marker.__editResendInjected = previousMarker;
							if (previousEventSeq === void 0) delete marker.__editResendEventSeq;
							else marker.__editResendEventSeq = previousEventSeq;
						});
					}
				};
				sync();
				observer = new MutationObserver(sync);
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => {
					observer?.disconnect();
					editors.dispose();
					for (const cleanup of cleanups.reverse()) cleanup();
				};
			}, [
				messages,
				edit,
				language
			]);
			return null;
		}
		//#endregion
		//#region src/client/EditResendHeader.tsx
		function EditResendHeader({ useEditResend, load, edit }) {
			const state = useEditResend((value) => value);
			const language = useLanguage();
			const messages = (0, react.useMemo)(() => {
				const users = (state.timeline?.messages ?? []).filter((message) => message.kind === "user");
				const lastSeq = Math.max(-1, ...users.map((message) => message.eventSeq));
				return users.filter((message) => message.eventSeq === lastSeq);
			}, [state.timeline]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InlineEdit, {
				messages,
				edit,
				language
			});
		}
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"conversation",
			"connection",
			"sessions",
			"locale"
		];
		function apply(ctx) {
			configureLocale(ctx.locale);
			const controllers = /* @__PURE__ */ new Map();
			const controllerFor = (sessionId) => {
				let controller = controllers.get(sessionId);
				if (controller === void 0) {
					controller = new EditResendController(ctx, sessionId);
					controllers.set(sessionId, controller);
				}
				return controller;
			};
			ctx.on("connection/reset", () => {
				for (const controller of controllers.values()) controller.refreshIfLoaded();
			});
			ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "edit-resend-controls",
				order: 15,
				inject: (sessionId) => controllerFor(sessionId).face
			}, EditResendHeader);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map