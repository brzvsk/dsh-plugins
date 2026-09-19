// dsh-model-effort — browser half.
// Codex-style model + reasoning-effort selector for the `conversation.input.model`
// slot: current model on top, its effort slider directly below, one popover,
// no Advanced submenu. Clean pill slider, no gimmicks.
window.__ModuleLoader__.load({
  id: "dsh-model-effort",
  factory: (require) => {
    const React = require("react");

    // --- helpers -------------------------------------------------------------

    const fmtEffort = (id) =>
      typeof id === "string"
        ? id.charAt(0).toUpperCase() + id.slice(1)
        : String(id ?? "");

    // Supported effort slots of a model: [{ id, label }]. Falls back to the
    // canonical list when the provider does not expose efforts.
    const effortsOf = (model) => {
      const raw = model && model.reasoning && model.reasoning.efforts;
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((e) =>
          typeof e === "string"
            ? { id: e, label: fmtEffort(e) }
            : { id: e.id, label: e.label || fmtEffort(e.id) },
        );
      }
      return [
        { id: "low", label: "Low" },
        { id: "medium", label: "Medium" },
        { id: "high", label: "High" },
      ];
    };

    const modelName = (m) => m && (m.name || m.id || "(unknown)");
    const groupName = (g) => g && (g.label || g.id || "-");
    const providerOf = (model) =>
      model && model.provider ? model.provider : null;

    // --- component -----------------------------------------------------------

    function CodexModelSelect(props) {
      const { locked, available, directory, load, select, t } = props;

      const [snapshot, setSnapshot] = React.useState(() =>
        directory.getSnapshot(),
      );
      React.useEffect(() => {
        let unsub = () => {};
        try {
          unsub = directory.subscribe(() =>
            setSnapshot(directory.getSnapshot()),
          );
          setSnapshot(directory.getSnapshot());
        } catch (err) {
          // store may be unavailable; keep the initial value
        }
        return unsub;
      }, [directory]);

      React.useEffect(() => {
        load && load();
      }, [load]);

      const state = snapshot;
      const [open, setOpen] = React.useState(false);
      const [chooserOpen, setChooserOpen] = React.useState(false);
      const trackRef = React.useRef(null);
      const [dragIdx, setDragIdx] = React.useState(null);

      const groups = Array.isArray(state && state.groups)
        ? state.groups
        : [];
      const current = state && state.current ? state.current : null;

      // Flatten models into [group, model] pairs for the chooser.
      const choices = [];
      for (const g of groups) {
        const models = Array.isArray(g.models) ? g.models : [];
        for (const m of models) {
          choices.push({ group: g, model: m });
        }
      }

      const currentChoice = current
        ? choices.find(
            (c) =>
              c.model.id === current.model &&
              (c.group.id === current.provider ||
                providerOf(c.model) === current.provider),
          )
        : void 0;

      const effChoices = currentChoice
        ? effortsOf(currentChoice.model)
        : [];
      const explicitEffort =
        current && current.reasoningEffort !== void 0
          ? current.reasoningEffort
          : void 0;
      const appliedIdx = Math.max(
        0,
        effChoices.findIndex((e) => e.id === explicitEffort),
      );

      // --- slider drag state --------------------------------------------------
      const sliderN = effChoices.length;
      const activeIdx = dragIdx !== null ? dragIdx : appliedIdx;
      const sliderPct = sliderN > 1 ? (activeIdx / (sliderN - 1)) * 100 : 50;
      const dragLiveIdx = React.useRef(null);

      const effIndexFromX = (clientX) => {
        const el = trackRef.current;
        if (!el || sliderN < 2) return 0;
        const rect = el.getBoundingClientRect();
        const frac = (clientX - rect.left) / rect.width;
        return Math.round(Math.max(0, Math.min(1, frac)) * (sliderN - 1));
      };
      const onPointerDown = (e) => {
        if (!sliderN) return;
        e.preventDefault();
        const idx = effIndexFromX(e.clientX);
        dragLiveIdx.current = idx;
        setDragIdx(idx);
        if (e.currentTarget.setPointerCapture) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      };
      const onPointerMove = (e) => {
        if (dragIdx === null) return;
        const idx = effIndexFromX(e.clientX);
        dragLiveIdx.current = idx;
        setDragIdx(idx);
      };
      const onPointerUp = () => {
        if (dragIdx === null || !currentChoice) return;
        const idx = dragLiveIdx.current ?? dragIdx;
        const eff = effChoices[idx] || effChoices[sliderN - 1];
        if (eff) {
          commit({
            provider: currentChoice.group.id,
            model: currentChoice.model.id,
            reasoningEffort: eff.id,
          });
        }
        setDragIdx(null);
        dragLiveIdx.current = null;
      };

      const triggerLabel = !current
        ? t ? t("trigger.default") : "Model"
        : currentChoice
          ? `${modelName(currentChoice.model)} · ${
              explicitEffort !== void 0
                ? fmtEffort(explicitEffort)
                : (t ? t("trigger.default") : "Default")
            }`
          : `${current.model ?? ""} ${fmtEffort(current.reasoningEffort ?? "")}`;

      const commit = (selection) => {
        select(selection).then(() => {
          setOpen(false);
          setChooserOpen(false);
        });
      };

      if (!available) return null;

      return React.createElement(
        "div",
        { className: "dme-root" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "dme-trigger",
            disabled: locked ? true : void 0,
            onClick: () => setOpen((v) => !v),
          },
          triggerLabel,
          React.createElement("span", { className: "dme-chev" }, "\u25BE"),
        ),
        open &&
          React.createElement(
            "div",
            { className: "dme-popover", onClick: (e) => e.stopPropagation() },
            // Model section
            React.createElement(
              "div",
              { className: "dme-section" },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "dme-row dme-model-row",
                  onClick: () => setChooserOpen((v) => !v),
                },
                React.createElement(
                  "span",
                  { className: "dme-row-label" },
                  "Model",
                ),
                React.createElement(
                  "span",
                  { className: "dme-row-value dme-model-value" },
                  currentChoice
                    ? modelName(currentChoice.model)
                    : (current && current.model) || "-",
                  React.createElement("span", { className: "dme-chev" }, "\u25BE"),
                ),
              ),
              chooserOpen &&
                React.createElement(
                  "div",
                  { className: "dme-list" },
                  groups.map((g) =>
                    React.createElement(
                      "div",
                      { className: "dme-group", key: g.id || g.label },
                      React.createElement(
                        "div",
                        { className: "dme-group-name" },
                        groupName(g),
                      ),
                      (Array.isArray(g.models) ? g.models : []).map((m) => {
                        const isCurrent =
                          current &&
                          current.model === m.id &&
                          (current.provider === g.id ||
                            providerOf(m) === current.provider);
                        return React.createElement(
                          "button",
                          {
                            type: "button",
                            key: m.id,
                            className:
                              "dme-item" + (isCurrent ? " dme-item-active" : ""),
                            onClick: () => {
                              const base = {
                                provider: g.id,
                                model: m.id,
                              };
                              const curEff =
                                current && current.reasoningEffort;
                              const sup = effortsOf(m);
                              const keep = sup.find(
                                (e) => e.id === curEff,
                              );
                              const sel = keep
                                ? { ...base, reasoningEffort: keep.id }
                                : sup[0]
                                  ? { ...base, reasoningEffort: sup[0].id }
                                  : base;
                              commit(sel);
                            },
                          },
                          modelName(m),
                        );
                      }),
                    ),
                  ),
                ),
            ),
            // Effort section
            currentChoice &&
              React.createElement(
                "div",
                { className: "dme-section" },
                React.createElement(
                  "div",
                  { className: "dme-row" },
                  React.createElement(
                    "span",
                    { className: "dme-row-label" },
                    "Effort",
                  ),
                  React.createElement(
                    "span",
                    { className: "dme-row-value dme-effort-label" },
                    explicitEffort !== void 0
                      ? fmtEffort(explicitEffort)
                      : (t ? t("effort.providerDefault") : "Default"),
                  ),
                ),
                React.createElement(
                  "div",
                  { className: "dme-slider" },
                  React.createElement("span", { className: "dme-axis" }, "Faster"),
                  React.createElement(
                    "div",
                    {
                      className: "dme-track",
                      ref: trackRef,
                      role: "slider",
                      "aria-valuemin": 0,
                      "aria-valuemax": Math.max(0, sliderN - 1),
                      "aria-valuenow": activeIdx,
                      "aria-label": "Reasoning effort",
                      onPointerDown: onPointerDown,
                      onPointerMove: onPointerMove,
                      onPointerUp: onPointerUp,
                      onPointerCancel: onPointerUp,
                    },
                    React.createElement(
                      "div",
                      { className: "dme-fill", style: { width: sliderPct + "%" } },
                    ),
                    effChoices.map((e, i) =>
                      React.createElement("span", {
                        key: e.id,
                        className:
                          "dme-dot" + (i === activeIdx ? " dme-dot-on" : ""),
                        style: {
                          left:
                            sliderN > 1 ? i / (sliderN - 1) * 100 + "%" : "50%",
                        },
                      }),
                    ),
                    React.createElement("div", {
                      className: "dme-thumb",
                      style: { left: sliderPct + "%" },
                    }),
                  ),
                  React.createElement("span", { className: "dme-axis" }, "Smarter"),
                ),
              ),
          ),
      );
    }

    // --- plugin ---------------------------------------------------------------

    const styleId = "dsh-model-effort/styles";
    const CSS = `
.dme-root{position:relative;display:inline-flex}
.dme-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--card-foreground);font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit}
.dme-trigger:hover{border-color:var(--primary)}
.dme-trigger:disabled{opacity:.5;cursor:not-allowed}
.dme-chev{font-size:10px;opacity:.6;margin-left:2px}
.dme-popover{position:absolute;right:0;bottom:calc(100% + 8px);min-width:264px;max-width:320px;background:light-dark(#ffffff,#1e2025);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 28px light-dark(rgb(0 0 0/.18),rgb(0 0 0/.55));padding:7px;z-index:50}
.dme-section+.dme-section{margin-top:5px;padding-top:5px;border-top:1px solid var(--border)}
.dme-row{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;background:transparent;border:0;color:var(--foreground);font-family:inherit;font-size:12.5px;padding:4px 5px;border-radius:7px;cursor:pointer;text-align:left}
button.dme-model-row:hover,.dme-row:hover{background:light-dark(rgb(0 0 0/.04),rgb(255 255 255/.06))}
.dme-row-label{font-size:11.5px;color:var(--muted-foreground);flex:0 0 auto}
.dme-row-value{display:inline-flex;align-items:center;gap:4px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dme-row-value.dme-model-value{justify-content:flex-end}
.dme-list{margin-top:2px;max-height:200px;overflow:auto;display:flex;flex-direction:column;gap:1px}
.dme-group-name{font-size:10.5px;color:var(--muted-foreground);padding:4px 4px 1px}
.dme-item{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--foreground);font-family:inherit;font-size:12px;padding:4px 6px;border-radius:6px;cursor:pointer}
.dme-item:hover{background:light-dark(rgb(0 0 0/.04),rgb(255 255 255/.06))}
.dme-item-active{background:var(--primary);color:var(--primary-foreground)}
.dme-effort-label{font-variant-numeric:tabular-nums}
.dme-slider{display:flex;align-items:center;gap:8px;padding:11px 2px 2px}
.dme-axis{font-size:10.5px;color:var(--muted-foreground);white-space:nowrap;flex:0 0 auto}
.dme-track{position:relative;flex:1;height:26px;touch-action:none;cursor:pointer}
.dme-track::before{content:"";position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);height:10px;border-radius:99px;background:light-dark(rgb(0 0 0/.10),rgb(255 255 255/.16))}
.dme-fill{position:absolute;top:50%;left:0;transform:translateY(-50%);height:10px;border-radius:99px;background:var(--primary);pointer-events:none}
.dme-dot{position:absolute;top:50%;width:10px;height:10px;transform:translate(-50%,-50%);border-radius:50%;background:var(--muted-foreground);opacity:.55;pointer-events:none}
.dme-dot-on{background:var(--primary-foreground);opacity:1;box-shadow:0 0 0 2px var(--primary)}
.dme-thumb{position:absolute;top:50%;width:20px;height:20px;transform:translate(-50%,-50%);border-radius:50%;background:var(--card);border:2px solid var(--primary);box-shadow:0 2px 6px light-dark(rgb(0 0 0/.25),rgb(0 0 0/.55));pointer-events:none}
.dme-thumb-label{position:absolute;top:-15px;transform:translateX(-50%);font-size:10.5px;font-weight:500;color:var(--foreground);pointer-events:none;white-space:nowrap}
`;

    return {
      inject: ["slots", "sessions", "modelDirectories"],
      apply(ctx) {
        const slots = ctx.slots;
        const models = ctx.modelDirectories;
        const sessions = ctx.sessions;

        if (
          typeof document !== "undefined" &&
          !document.querySelector(`style[data-plugin-css="${styleId}"]`)
        ) {
          const style = document.createElement("style");
          style.dataset.plugin = "dsh-model-effort";
          style.dataset.pluginCss = styleId;
          style.textContent = CSS;
          document.head.appendChild(style);
        }

        if (slots && typeof slots.inject === "function") {
          slots.inject("conversation.input.model", () =>
            slots.register(
              {
                name: "conversation.input.model",
                priority: -1,
                inject: (sessionId) => {
                  const directory = models.directoryFor(sessionId);
                  const available =
                    sessions.subagentAddress(sessionId) === void 0;
                  return {
                    available,
                    directory: directory.store,
                    load: () => {
                      if (available) directory.load().catch(() => {});
                    },
                    select: (selection) =>
                      available
                        ? directory
                            .select(selection)
                            .then(() => true, () => false)
                        : Promise.resolve(false),
                  };
                },
              },
              CodexModelSelect,
            ),
          );
        }
      },
    };
  },
});
