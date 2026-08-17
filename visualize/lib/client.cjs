Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client.tsx
const STYLE_ID = "dsh-visualize-styles";
function injectStyles() {
	if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.setAttribute("data-plugin", "dsh-visualize");
	style.textContent = `
.viz-card{display:flex;flex-direction:column;border:1px solid rgba(127,127,127,.35);border-radius:10px;overflow:hidden;margin:6px 0;max-width:100%;background:var(--dsw-surface, #fff)}
.viz-header{display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:12px;flex-wrap:wrap}
.viz-title{font-weight:600}
.viz-path{color:var(--dsw-text-secondary, rgba(127,127,127,.9));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(420px,60%)}
.viz-size{color:var(--dsw-text-secondary, rgba(127,127,127,.9))}
.viz-badge{background:rgba(255,193,7,.18);color:#b8860b;border-radius:999px;padding:0 8px;font-size:11px}
.viz-action{background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:6px;padding:2px 8px;font-size:12px;cursor:pointer;margin-left:auto}
.viz-action:hover{background:rgba(127,127,127,.12)}
.viz-truncated{background:rgba(255,193,7,.12);color:#b8860b;padding:4px 10px;font-size:12px}
.viz-frame{width:100%;height:min(60vh,560px);border:0;border-top:1px solid rgba(127,127,127,.25);background:#fff;display:block}
.viz-row{font-size:13px;padding:8px 10px;border-radius:8px;margin:4px 0;border:1px solid rgba(127,127,127,.25)}
.viz-running{color:var(--dsw-text-secondary, rgba(127,127,127,.9))}
.viz-error{color:#c0392b;border-color:rgba(192,57,43,.4);background:rgba(192,57,43,.06)}
.viz-note{color:var(--dsw-text-secondary, rgba(127,127,127,.9))}
.viz-fallback{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`;
	document.head.appendChild(style);
}
function parseArgs(argsRaw) {
	try {
		const value = JSON.parse(argsRaw);
		return value && typeof value === "object" && typeof value.path === "string" ? value : {};
	} catch {
		return {};
	}
}
function isRunning(block) {
	return !("kind" in block);
}
function metaOf(node) {
	const meta = node.meta;
	if (meta && typeof meta === "object" && meta.kind === "visualize") return meta;
}
function firstText(block) {
	for (const content of block.content) {
		const text = content.text;
		if (typeof text === "string" && text.length > 0) return text;
	}
	return "visualize_html failed";
}
function formatBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1048576) return `${(n / 1024).toFixed(1)} KiB`;
	return `${(n / 1048576).toFixed(1)} MiB`;
}
function basename(path) {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1] || path;
}
function copyHtml(html) {
	if (typeof navigator === "undefined" || !navigator.clipboard) return;
	navigator.clipboard.writeText(html).catch(() => {});
}
function VisualizeToolView(props) {
	const { block, openFile } = props;
	if (isRunning(block)) {
		const path = parseArgs(block.argsRaw ?? "").path;
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "viz-row viz-running",
			children: path !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				"Visualizing ",
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: path }),
				"…"
			] }) : "Visualizing HTML…"
		});
	}
	const node = block;
	if (node.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "viz-row viz-error",
		children: firstText(node)
	});
	const meta = metaOf(node);
	if (meta === void 0) {
		const path = node.call !== null ? parseArgs(node.call.argsRaw).path : void 0;
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "viz-row viz-fallback",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "viz-note",
				children: "Preview unavailable (older session record)."
			}), path !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "viz-action",
				onClick: () => openFile(path),
				children: "Open in browser"
			})]
		});
	}
	const title = basename(meta.path);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "viz-card",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "viz-header",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "viz-title",
						children: title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "viz-path",
						title: meta.path,
						children: meta.path
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "viz-size",
						children: formatBytes(meta.size)
					}),
					meta.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "viz-badge",
						children: "truncated"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "viz-action",
						onClick: () => openFile(meta.path),
						children: "Open in browser"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "viz-action",
						onClick: () => copyHtml(meta.html),
						children: "Copy HTML"
					})
				]
			}),
			meta.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "viz-truncated",
				children: "Preview truncated — open in browser for the full file."
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				className: "viz-frame",
				sandbox: "allow-scripts",
				referrerPolicy: "no-referrer",
				srcDoc: meta.html,
				title: `Preview of ${meta.path}`
			})
		]
	});
}
function apply(ctx) {
	injectStyles();
	const dispose = ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
		name: "tool.call.toolview",
		key: "visualize_html"
	}, VisualizeToolView));
	return () => {
		dispose();
	};
}
/**
* Services required by the browser half, by SERVICE name (the client registry
* reads the module's exported `inject`, same contract as shipped client
* bundles). `slots` is provided by the client runtime.
*/
const inject = ["slots"];
//#endregion
exports.apply = apply;
exports.inject = inject;
