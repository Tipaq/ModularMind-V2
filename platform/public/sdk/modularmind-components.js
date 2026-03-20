/**
 * ModularMind Design System — Web Components
 * Layer 3: ~20 components using Shadow DOM + CSS variables from Layer 1
 *
 * All components inherit CSS variables from the parent document.
 * No dependencies. Works in any HTML context.
 */
(function () {
  "use strict";

  // ── Shared styles (adopted by all components) ──
  const SHARED_CSS = `
    :host { display: block; font-family: system-ui, -apple-system, sans-serif; }
    :host([hidden]) { display: none; }
    *, *::before, *::after { box-sizing: border-box; }
  `;

  function css(strings, ...values) {
    return SHARED_CSS + strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "");
  }

  function define(tag, cls) {
    if (!customElements.get(tag)) customElements.define(tag, cls);
  }

  // ── Helper: create shadow with styles ──
  function shadow(el, styles) {
    const s = el.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    s.adoptedStyleSheets = [sheet];
    return s;
  }

  // ════════════════════════════════════════════════════════════════
  // LAYOUT
  // ════════════════════════════════════════════════════════════════

  // ── Card ──
  class MmCard extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host {
        display: block;
        border-radius: calc(var(--radius) * 1.5);
        border: 1px solid hsl(var(--border));
        background: hsl(var(--card));
        color: hsl(var(--card-foreground));
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
        transition: box-shadow 0.2s;
      }
      :host(:hover) { box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
    `); this._s.innerHTML = "<slot></slot>"; }
  }
  define("mm-card", MmCard);

  class MmCardHeader extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: flex; flex-direction: column; gap: 0.375rem; padding: 1.5rem 1.5rem 0; }
      ::slotted(*) { margin: 0; }
      ::slotted(:first-child) { font-weight: 600; font-size: 1rem; line-height: 1.4; }
      ::slotted(:nth-child(2)) { font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
    `); this._s.innerHTML = "<slot></slot>"; }
  }
  define("mm-card-header", MmCardHeader);

  class MmCardContent extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; padding: 1.5rem; }
    `); this._s.innerHTML = "<slot></slot>"; }
  }
  define("mm-card-content", MmCardContent);

  class MmCardFooter extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: flex; align-items: center; gap: 0.5rem; padding: 0 1.5rem 1.5rem; }
    `); this._s.innerHTML = "<slot></slot>"; }
  }
  define("mm-card-footer", MmCardFooter);

  // ── Stack ──
  class MmStack extends HTMLElement {
    static get observedAttributes() { return ["direction", "gap", "align", "justify"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: flex; flex-direction: column; }
      :host([direction="row"]) { flex-direction: row; }
      :host([gap="xs"]) { gap: 0.25rem; }
      :host([gap="sm"]) { gap: 0.5rem; }
      :host([gap="md"]) { gap: 1rem; }
      :host([gap="lg"]) { gap: 1.5rem; }
      :host([gap="xl"]) { gap: 2rem; }
      :host([align="center"]) { align-items: center; }
      :host([align="start"]) { align-items: flex-start; }
      :host([align="end"]) { align-items: flex-end; }
      :host([align="stretch"]) { align-items: stretch; }
      :host([justify="center"]) { justify-content: center; }
      :host([justify="between"]) { justify-content: space-between; }
      :host([justify="end"]) { justify-content: flex-end; }
      :host([wrap]) { flex-wrap: wrap; }
    `); this._s.innerHTML = "<slot></slot>"; }
  }
  define("mm-stack", MmStack);

  // ── Grid ──
  class MmGrid extends HTMLElement {
    static get observedAttributes() { return ["cols", "gap"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: grid; grid-template-columns: repeat(var(--cols, 2), 1fr); }
      :host([cols="1"]) { --cols: 1; }
      :host([cols="2"]) { --cols: 2; }
      :host([cols="3"]) { --cols: 3; }
      :host([cols="4"]) { --cols: 4; }
      :host([cols="5"]) { --cols: 5; }
      :host([cols="6"]) { --cols: 6; }
      :host([gap="sm"]) { gap: 0.5rem; }
      :host([gap="md"]) { gap: 1rem; }
      :host([gap="lg"]) { gap: 1.5rem; }
    `); this._s.innerHTML = "<slot></slot>"; }
  }
  define("mm-grid", MmGrid);

  // ── Divider ──
  class MmDivider extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; height: 1px; background: hsl(var(--border)); margin: 1rem 0; }
    `); }
  }
  define("mm-divider", MmDivider);

  // ════════════════════════════════════════════════════════════════
  // FORMS
  // ════════════════════════════════════════════════════════════════

  // ── Button ──
  class MmButton extends HTMLElement {
    static get observedAttributes() { return ["variant", "size", "disabled", "loading"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-flex; }
      button {
        display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
        border: 1px solid transparent; border-radius: var(--radius);
        font-size: 0.875rem; font-weight: 500; font-family: inherit;
        cursor: pointer; transition: all 0.15s; white-space: nowrap;
        padding: 0.5rem 1rem; height: 2.25rem;
      }
      button:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
      button:disabled { opacity: 0.5; pointer-events: none; }
      /* Variants */
      :host(:not([variant])) button, :host([variant="primary"]) button {
        background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
      :host(:not([variant])) button:hover, :host([variant="primary"]) button:hover {
        filter: brightness(1.1); }
      :host([variant="secondary"]) button {
        background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); }
      :host([variant="secondary"]) button:hover { filter: brightness(0.95); }
      :host([variant="destructive"]) button {
        background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
      :host([variant="outline"]) button {
        background: transparent; border-color: hsl(var(--input)); color: hsl(var(--foreground)); }
      :host([variant="outline"]) button:hover { background: hsl(var(--accent)); }
      :host([variant="ghost"]) button {
        background: transparent; color: hsl(var(--foreground)); }
      :host([variant="ghost"]) button:hover { background: hsl(var(--accent)); }
      /* Sizes */
      :host([size="sm"]) button { height: 2rem; padding: 0.25rem 0.75rem; font-size: 0.8125rem; }
      :host([size="lg"]) button { height: 2.75rem; padding: 0.5rem 1.5rem; font-size: 1rem; }
      /* Loading */
      .spinner { width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `);
      this._s.innerHTML = '<button part="button"><slot></slot></button>';
    }
    connectedCallback() { this._sync(); }
    attributeChangedCallback() { this._sync(); }
    _sync() {
      const btn = this._s.querySelector("button");
      if (!btn) return;
      btn.disabled = this.hasAttribute("disabled") || this.hasAttribute("loading");
      if (this.hasAttribute("loading")) {
        if (!btn.querySelector(".spinner")) {
          const sp = document.createElement("span");
          sp.className = "spinner";
          btn.prepend(sp);
        }
      } else {
        btn.querySelector(".spinner")?.remove();
      }
    }
  }
  define("mm-button", MmButton);

  // ── Input ──
  class MmInput extends HTMLElement {
    static get observedAttributes() { return ["type", "placeholder", "label", "error", "value", "disabled"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.375rem; color: hsl(var(--foreground)); }
      input {
        width: 100%; height: 2.25rem; padding: 0 0.75rem;
        border: 1px solid hsl(var(--input)); border-radius: var(--radius);
        background: transparent; color: hsl(var(--foreground));
        font-size: 0.875rem; font-family: inherit;
        transition: border-color 0.15s;
      }
      input::placeholder { color: hsl(var(--muted-foreground)); }
      input:focus { outline: none; border-color: hsl(var(--ring)); box-shadow: 0 0 0 1px hsl(var(--ring)); }
      input:disabled { opacity: 0.5; }
      :host([error]) input { border-color: hsl(var(--destructive)); }
      .error { font-size: 0.8125rem; color: hsl(var(--destructive)); margin-top: 0.25rem; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const label = this.getAttribute("label");
      const error = this.getAttribute("error");
      this._s.innerHTML = `
        ${label ? `<label>${label}</label>` : ""}
        <input type="${this.getAttribute("type") || "text"}"
               placeholder="${this.getAttribute("placeholder") || ""}"
               value="${this.getAttribute("value") || ""}"
               ${this.hasAttribute("disabled") ? "disabled" : ""}>
        ${error ? `<div class="error">${error}</div>` : ""}
      `;
      const input = this._s.querySelector("input");
      input?.addEventListener("input", (e) => {
        this.setAttribute("value", e.target.value);
        this.dispatchEvent(new CustomEvent("change", { detail: e.target.value, bubbles: true }));
      });
    }
    get value() { return this._s.querySelector("input")?.value || ""; }
    set value(v) { const i = this._s.querySelector("input"); if (i) i.value = v; }
  }
  define("mm-input", MmInput);

  // ── Textarea ──
  class MmTextarea extends HTMLElement {
    static get observedAttributes() { return ["placeholder", "label", "error", "rows", "value"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.375rem; }
      textarea {
        width: 100%; min-height: 80px; padding: 0.5rem 0.75rem;
        border: 1px solid hsl(var(--input)); border-radius: var(--radius);
        background: transparent; color: hsl(var(--foreground));
        font-size: 0.875rem; font-family: inherit; resize: vertical;
      }
      textarea:focus { outline: none; border-color: hsl(var(--ring)); box-shadow: 0 0 0 1px hsl(var(--ring)); }
      :host([error]) textarea { border-color: hsl(var(--destructive)); }
      .error { font-size: 0.8125rem; color: hsl(var(--destructive)); margin-top: 0.25rem; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const label = this.getAttribute("label");
      const error = this.getAttribute("error");
      this._s.innerHTML = `
        ${label ? `<label>${label}</label>` : ""}
        <textarea rows="${this.getAttribute("rows") || 3}"
                  placeholder="${this.getAttribute("placeholder") || ""}"
                  ${this.hasAttribute("disabled") ? "disabled" : ""}>${this.getAttribute("value") || ""}</textarea>
        ${error ? `<div class="error">${error}</div>` : ""}
      `;
    }
    get value() { return this._s.querySelector("textarea")?.value || ""; }
    set value(v) { const t = this._s.querySelector("textarea"); if (t) t.value = v; }
  }
  define("mm-textarea", MmTextarea);

  // ── Select (wraps native <select>) ──
  class MmSelect extends HTMLElement {
    static get observedAttributes() { return ["label", "placeholder", "value", "error"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.375rem; }
      select {
        width: 100%; height: 2.25rem; padding: 0 2rem 0 0.75rem;
        border: 1px solid hsl(var(--input)); border-radius: var(--radius);
        background: hsl(var(--background)); color: hsl(var(--foreground));
        font-size: 0.875rem; font-family: inherit;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 0.5rem center;
      }
      select:focus { outline: none; border-color: hsl(var(--ring)); box-shadow: 0 0 0 1px hsl(var(--ring)); }
      :host([error]) select { border-color: hsl(var(--destructive)); }
      .error { font-size: 0.8125rem; color: hsl(var(--destructive)); margin-top: 0.25rem; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const label = this.getAttribute("label");
      const error = this.getAttribute("error");
      const placeholder = this.getAttribute("placeholder");
      const options = Array.from(this.querySelectorAll("option")).map(o => o.outerHTML).join("");
      this._s.innerHTML = `
        ${label ? `<label>${label}</label>` : ""}
        <select>
          ${placeholder ? `<option value="" disabled selected>${placeholder}</option>` : ""}
          ${options}
        </select>
        ${error ? `<div class="error">${error}</div>` : ""}
      `;
      const sel = this._s.querySelector("select");
      if (this.getAttribute("value")) sel.value = this.getAttribute("value");
      sel?.addEventListener("change", (e) => {
        this.dispatchEvent(new CustomEvent("change", { detail: e.target.value, bubbles: true }));
      });
    }
    get value() { return this._s.querySelector("select")?.value || ""; }
  }
  define("mm-select", MmSelect);

  // ── Switch ──
  class MmSwitch extends HTMLElement {
    static get observedAttributes() { return ["checked", "label", "disabled"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; }
      :host([disabled]) { opacity: 0.5; pointer-events: none; }
      .track {
        width: 2.25rem; height: 1.25rem; border-radius: 9999px;
        background: hsl(var(--input)); position: relative; transition: background 0.2s;
      }
      :host([checked]) .track { background: hsl(var(--primary)); }
      .thumb {
        position: absolute; top: 2px; left: 2px;
        width: 1rem; height: 1rem; border-radius: 50%;
        background: white; box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
        transition: transform 0.2s;
      }
      :host([checked]) .thumb { transform: translateX(1rem); }
      .label { font-size: 0.875rem; }
    `); }
    connectedCallback() {
      this._render();
      this.addEventListener("click", () => {
        if (this.hasAttribute("disabled")) return;
        this.toggleAttribute("checked");
        this.dispatchEvent(new CustomEvent("change", { detail: this.hasAttribute("checked"), bubbles: true }));
      });
    }
    attributeChangedCallback() { this._render(); }
    _render() {
      const label = this.getAttribute("label");
      this._s.innerHTML = `<div class="track"><div class="thumb"></div></div>${label ? `<span class="label">${label}</span>` : ""}`;
    }
    get checked() { return this.hasAttribute("checked"); }
    set checked(v) { v ? this.setAttribute("checked", "") : this.removeAttribute("checked"); }
  }
  define("mm-switch", MmSwitch);

  // ── Checkbox ──
  class MmCheckbox extends HTMLElement {
    static get observedAttributes() { return ["checked", "label", "disabled"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; }
      :host([disabled]) { opacity: 0.5; pointer-events: none; }
      .box {
        width: 1rem; height: 1rem; border-radius: 3px;
        border: 1.5px solid hsl(var(--input)); display: flex; align-items: center; justify-content: center;
        transition: all 0.15s;
      }
      :host([checked]) .box { background: hsl(var(--primary)); border-color: hsl(var(--primary)); }
      .check { display: none; color: hsl(var(--primary-foreground)); font-size: 0.7rem; }
      :host([checked]) .check { display: block; }
      .label { font-size: 0.875rem; }
    `); }
    connectedCallback() {
      this._render();
      this.addEventListener("click", () => {
        if (this.hasAttribute("disabled")) return;
        this.toggleAttribute("checked");
        this.dispatchEvent(new CustomEvent("change", { detail: this.hasAttribute("checked"), bubbles: true }));
      });
    }
    attributeChangedCallback() { this._render(); }
    _render() {
      const label = this.getAttribute("label");
      this._s.innerHTML = `<div class="box"><span class="check">✓</span></div>${label ? `<span class="label">${label}</span>` : ""}`;
    }
    get checked() { return this.hasAttribute("checked"); }
    set checked(v) { v ? this.setAttribute("checked", "") : this.removeAttribute("checked"); }
  }
  define("mm-checkbox", MmCheckbox);

  // ════════════════════════════════════════════════════════════════
  // DATA
  // ════════════════════════════════════════════════════════════════

  // ── Badge ──
  class MmBadge extends HTMLElement {
    static get observedAttributes() { return ["variant"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-flex; }
      span {
        display: inline-flex; align-items: center;
        border-radius: var(--radius); padding: 0.125rem 0.625rem;
        font-size: 0.75rem; font-weight: 600; line-height: 1.4;
        border: 1px solid transparent;
      }
      :host(:not([variant])) span, :host([variant="default"]) span {
        background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
      :host([variant="secondary"]) span {
        background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); }
      :host([variant="success"]) span {
        background: hsl(var(--success) / 0.15); color: hsl(var(--success)); }
      :host([variant="warning"]) span {
        background: hsl(var(--warning) / 0.15); color: hsl(var(--warning)); }
      :host([variant="destructive"]) span {
        background: hsl(var(--destructive) / 0.15); color: hsl(var(--destructive)); }
      :host([variant="info"]) span {
        background: hsl(var(--info) / 0.15); color: hsl(var(--info)); }
      :host([variant="outline"]) span {
        background: transparent; border-color: hsl(var(--border)); color: hsl(var(--foreground)); }
    `); this._s.innerHTML = "<span><slot></slot></span>"; }
  }
  define("mm-badge", MmBadge);

  // ── Stat ──
  class MmStat extends HTMLElement {
    static get observedAttributes() { return ["label", "value", "trend", "trend-up"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      .label { font-size: 0.8125rem; color: hsl(var(--muted-foreground)); margin-bottom: 0.25rem; }
      .value { font-size: 1.5rem; font-weight: 700; line-height: 1.2; }
      .trend { font-size: 0.75rem; font-weight: 500; margin-top: 0.25rem; }
      .trend.up { color: hsl(var(--success)); }
      .trend.down { color: hsl(var(--destructive)); }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const trend = this.getAttribute("trend");
      const up = this.hasAttribute("trend-up");
      this._s.innerHTML = `
        <div class="label">${this.getAttribute("label") || ""}</div>
        <div class="value">${this.getAttribute("value") || "0"}</div>
        ${trend ? `<div class="trend ${up ? "up" : "down"}">${up ? "↑" : "↓"} ${trend}</div>` : ""}
      `;
    }
  }
  define("mm-stat", MmStat);

  // ── Progress ──
  class MmProgress extends HTMLElement {
    static get observedAttributes() { return ["value", "variant"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      .track { width: 100%; height: 0.5rem; border-radius: 9999px; background: hsl(var(--secondary)); overflow: hidden; }
      .bar { height: 100%; border-radius: 9999px; transition: width 0.3s ease; background: hsl(var(--primary)); }
      :host([variant="success"]) .bar { background: hsl(var(--success)); }
      :host([variant="warning"]) .bar { background: hsl(var(--warning)); }
      :host([variant="destructive"]) .bar { background: hsl(var(--destructive)); }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const v = Math.min(100, Math.max(0, parseInt(this.getAttribute("value") || "0")));
      this._s.innerHTML = `<div class="track"><div class="bar" style="width:${v}%"></div></div>`;
    }
  }
  define("mm-progress", MmProgress);

  // ── Alert ──
  class MmAlert extends HTMLElement {
    static get observedAttributes() { return ["variant", "title"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      .alert {
        padding: 0.75rem 1rem; border-radius: var(--radius);
        border: 1px solid hsl(var(--border)); font-size: 0.875rem;
      }
      .title { font-weight: 600; margin-bottom: 0.25rem; }
      :host([variant="info"]) .alert { background: hsl(var(--info) / 0.1); border-color: hsl(var(--info) / 0.3); color: hsl(var(--info)); }
      :host([variant="success"]) .alert { background: hsl(var(--success) / 0.1); border-color: hsl(var(--success) / 0.3); color: hsl(var(--success)); }
      :host([variant="warning"]) .alert { background: hsl(var(--warning) / 0.1); border-color: hsl(var(--warning) / 0.3); color: hsl(var(--warning)); }
      :host([variant="destructive"]) .alert { background: hsl(var(--destructive) / 0.1); border-color: hsl(var(--destructive) / 0.3); color: hsl(var(--destructive)); }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const title = this.getAttribute("title");
      this._s.innerHTML = `<div class="alert">${title ? `<div class="title">${title}</div>` : ""}<slot></slot></div>`;
    }
  }
  define("mm-alert", MmAlert);

  // ════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════════════

  // ── Tabs ──
  class MmTabs extends HTMLElement {
    static get observedAttributes() { return ["value"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      .tabs-list { display: flex; border-bottom: 1px solid hsl(var(--border)); }
      ::slotted(mm-tab) { display: none; }
      .tab-btn {
        padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 500;
        border: none; background: none; cursor: pointer; font-family: inherit;
        border-bottom: 2px solid transparent; color: hsl(var(--muted-foreground));
        transition: all 0.15s;
      }
      .tab-btn:hover { color: hsl(var(--foreground)); }
      .tab-btn.active { color: hsl(var(--primary)); border-bottom-color: hsl(var(--primary)); }
      .content { padding-top: 1rem; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const active = this.getAttribute("value");
      const tabs = Array.from(this.querySelectorAll("mm-tab"));
      const buttons = tabs.map(t => {
        const val = t.getAttribute("value");
        const label = t.getAttribute("label") || val;
        return `<button class="tab-btn ${val === active ? "active" : ""}" data-tab="${val}">${label}</button>`;
      }).join("");
      const activeTab = tabs.find(t => t.getAttribute("value") === active);
      this._s.innerHTML = `<div class="tabs-list">${buttons}</div><div class="content">${activeTab ? activeTab.innerHTML : ""}</div>`;
      this._s.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          this.setAttribute("value", btn.dataset.tab);
          this.dispatchEvent(new CustomEvent("change", { detail: btn.dataset.tab, bubbles: true }));
        });
      });
    }
  }
  define("mm-tabs", MmTabs);

  class MmTab extends HTMLElement {
    static get observedAttributes() { return ["value", "label"]; }
    constructor() { super(); }
  }
  define("mm-tab", MmTab);

  // ── Dialog (wraps native <dialog>) ──
  class MmDialog extends HTMLElement {
    static get observedAttributes() { return ["open", "title"]; }
    constructor() { super(); this._s = shadow(this, css`
      dialog {
        border: 1px solid hsl(var(--border));
        border-radius: calc(var(--radius) * 1.5);
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        padding: 0; max-width: 32rem; width: 90vw;
        box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
      }
      dialog::backdrop { background: rgb(0 0 0 / 0.6); }
      .header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1.5rem 1.5rem 0;
      }
      .title { font-size: 1.125rem; font-weight: 600; }
      .close {
        border: none; background: none; cursor: pointer; padding: 0.25rem;
        color: hsl(var(--muted-foreground)); font-size: 1.25rem; line-height: 1;
      }
      .close:hover { color: hsl(var(--foreground)); }
      .body { padding: 1.5rem; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback(name) {
      if (name === "open") {
        const dlg = this._s.querySelector("dialog");
        if (!dlg) return;
        this.hasAttribute("open") ? dlg.showModal() : dlg.close();
      } else {
        this._render();
      }
    }
    _render() {
      const title = this.getAttribute("title");
      this._s.innerHTML = `
        <dialog>
          <div class="header">
            <div class="title">${title || ""}</div>
            <button class="close" aria-label="Close">&times;</button>
          </div>
          <div class="body"><slot></slot></div>
        </dialog>
      `;
      const dlg = this._s.querySelector("dialog");
      this._s.querySelector(".close")?.addEventListener("click", () => {
        this.removeAttribute("open");
        this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
      });
      dlg?.addEventListener("close", () => {
        this.removeAttribute("open");
        this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
      });
      if (this.hasAttribute("open")) dlg?.showModal();
    }
  }
  define("mm-dialog", MmDialog);

  // ── Tooltip ──
  class MmTooltip extends HTMLElement {
    static get observedAttributes() { return ["content", "position"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-block; position: relative; }
      .tip {
        position: absolute; z-index: 50; padding: 0.375rem 0.75rem;
        background: hsl(var(--foreground)); color: hsl(var(--background));
        font-size: 0.75rem; border-radius: var(--radius);
        white-space: nowrap; pointer-events: none; opacity: 0;
        transition: opacity 0.15s;
      }
      :host(:hover) .tip { opacity: 1; }
      :host(:not([position])) .tip, :host([position="top"]) .tip { bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); }
      :host([position="bottom"]) .tip { top: calc(100% + 6px); left: 50%; transform: translateX(-50%); }
      :host([position="left"]) .tip { right: calc(100% + 6px); top: 50%; transform: translateY(-50%); }
      :host([position="right"]) .tip { left: calc(100% + 6px); top: 50%; transform: translateY(-50%); }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      this._s.innerHTML = `<slot></slot><div class="tip">${this.getAttribute("content") || ""}</div>`;
    }
  }
  define("mm-tooltip", MmTooltip);

  // ════════════════════════════════════════════════════════════════
  // ADDITIONAL COMPONENTS
  // ════════════════════════════════════════════════════════════════

  // ── Avatar ──
  class MmAvatar extends HTMLElement {
    static get observedAttributes() { return ["src", "alt", "fallback", "size"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-flex; }
      .avatar {
        position: relative; display: flex; overflow: hidden; border-radius: 50%;
        width: 2.5rem; height: 2.5rem; flex-shrink: 0;
      }
      :host([size="sm"]) .avatar { width: 2rem; height: 2rem; }
      :host([size="lg"]) .avatar { width: 3rem; height: 3rem; }
      :host([size="xl"]) .avatar { width: 4rem; height: 4rem; }
      img { width: 100%; height: 100%; object-fit: cover; }
      .fallback {
        display: flex; width: 100%; height: 100%;
        align-items: center; justify-content: center;
        background: hsl(var(--muted)); color: hsl(var(--muted-foreground));
        font-size: 0.875rem; font-weight: 500;
      }
      :host([size="sm"]) .fallback { font-size: 0.75rem; }
      :host([size="lg"]) .fallback { font-size: 1rem; }
      :host([size="xl"]) .fallback { font-size: 1.25rem; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const src = this.getAttribute("src");
      const alt = this.getAttribute("alt") || "";
      const fallback = this.getAttribute("fallback") || alt.charAt(0).toUpperCase() || "?";
      if (src) {
        this._s.innerHTML = `<div class="avatar"><img src="${src}" alt="${alt}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="fallback" style="display:none">${fallback}</div></div>`;
      } else {
        this._s.innerHTML = `<div class="avatar"><div class="fallback">${fallback}</div></div>`;
      }
    }
  }
  define("mm-avatar", MmAvatar);

  // ── Separator ──
  class MmSeparator extends HTMLElement {
    static get observedAttributes() { return ["orientation"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; background: hsl(var(--border)); flex-shrink: 0; }
      :host(:not([orientation="vertical"])) { height: 1px; width: 100%; margin: 0.5rem 0; }
      :host([orientation="vertical"]) { width: 1px; height: 100%; margin: 0 0.5rem; display: inline-block; }
    `); }
  }
  define("mm-separator", MmSeparator);

  // ── Slider ──
  class MmSlider extends HTMLElement {
    static get observedAttributes() { return ["value", "min", "max", "step", "label"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      label { display: flex; justify-content: space-between; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem; }
      .val { color: hsl(var(--muted-foreground)); font-weight: 400; }
      input[type="range"] {
        width: 100%; height: 6px; appearance: none; background: transparent; cursor: pointer;
      }
      input[type="range"]::-webkit-slider-track {
        height: 6px; border-radius: 9999px; background: hsl(var(--primary) / 0.2);
      }
      input[type="range"]::-webkit-slider-thumb {
        appearance: none; width: 16px; height: 16px; border-radius: 50%;
        background: hsl(var(--background)); border: 2px solid hsl(var(--primary));
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.2); margin-top: -5px;
      }
      input[type="range"]::-moz-range-track {
        height: 6px; border-radius: 9999px; background: hsl(var(--primary) / 0.2);
      }
      input[type="range"]::-moz-range-thumb {
        width: 16px; height: 16px; border-radius: 50%;
        background: hsl(var(--background)); border: 2px solid hsl(var(--primary));
      }
      input:focus-visible { outline: none; }
      input:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px hsl(var(--ring) / 0.3); }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const val = this.getAttribute("value") || "50";
      const min = this.getAttribute("min") || "0";
      const max = this.getAttribute("max") || "100";
      const step = this.getAttribute("step") || "1";
      const label = this.getAttribute("label");
      this._s.innerHTML = `
        ${label ? `<label><span>${label}</span><span class="val">${val}</span></label>` : ""}
        <input type="range" value="${val}" min="${min}" max="${max}" step="${step}">
      `;
      const input = this._s.querySelector("input");
      input?.addEventListener("input", (e) => {
        this.setAttribute("value", e.target.value);
        const valEl = this._s.querySelector(".val");
        if (valEl) valEl.textContent = e.target.value;
        this.dispatchEvent(new CustomEvent("change", { detail: Number(e.target.value), bubbles: true }));
      });
    }
    get value() { return Number(this._s.querySelector("input")?.value || 0); }
    set value(v) { this.setAttribute("value", String(v)); }
  }
  define("mm-slider", MmSlider);

  // ── Label ──
  class MmLabel extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      label { font-size: 0.875rem; font-weight: 500; line-height: 1; color: hsl(var(--foreground)); }
    `); this._s.innerHTML = "<label><slot></slot></label>"; }
  }
  define("mm-label", MmLabel);

  // ── Empty State ──
  class MmEmptyState extends HTMLElement {
    static get observedAttributes() { return ["icon", "title", "description"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      .container {
        border-radius: calc(var(--radius) * 1.5); border: 1px solid hsl(var(--border) / 0.5);
        background: hsl(var(--card) / 0.5); padding: 3rem 1.5rem;
        display: flex; flex-direction: column; align-items: center; text-align: center;
      }
      .icon { font-size: 2.5rem; opacity: 0.3; margin-bottom: 1rem; }
      .title { font-size: 1.125rem; font-weight: 500; }
      .desc { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin-top: 0.5rem; }
      .action { margin-top: 1rem; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      this._s.innerHTML = `
        <div class="container">
          <div class="icon">${this.getAttribute("icon") || "📭"}</div>
          <div class="title">${this.getAttribute("title") || ""}</div>
          <div class="desc">${this.getAttribute("description") || ""}</div>
          <div class="action"><slot></slot></div>
        </div>
      `;
    }
  }
  define("mm-empty-state", MmEmptyState);

  // ── Spinner ──
  class MmSpinner extends HTMLElement {
    static get observedAttributes() { return ["size"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-flex; }
      .spinner {
        border: 2.5px solid hsl(var(--muted));
        border-top-color: hsl(var(--primary));
        border-radius: 50%; animation: spin 0.7s linear infinite;
        width: 1.5rem; height: 1.5rem;
      }
      :host([size="sm"]) .spinner { width: 1rem; height: 1rem; border-width: 2px; }
      :host([size="lg"]) .spinner { width: 2.5rem; height: 2.5rem; border-width: 3px; }
      :host([size="xl"]) .spinner { width: 3.5rem; height: 3.5rem; border-width: 4px; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `); this._s.innerHTML = '<div class="spinner"></div>'; }
  }
  define("mm-spinner", MmSpinner);

  // ── Skeleton ──
  class MmSkeleton extends HTMLElement {
    static get observedAttributes() { return ["width", "height", "rounded"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      .skeleton {
        background: hsl(var(--muted));
        border-radius: var(--radius);
        animation: pulse 1.5s ease-in-out infinite;
      }
      :host([rounded]) .skeleton { border-radius: 9999px; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const w = this.getAttribute("width") || "100%";
      const h = this.getAttribute("height") || "1rem";
      this._s.innerHTML = `<div class="skeleton" style="width:${w};height:${h}"></div>`;
    }
  }
  define("mm-skeleton", MmSkeleton);

  // ── Status Badge ──
  class MmStatusBadge extends HTMLElement {
    static get observedAttributes() { return ["status"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-flex; }
      .badge {
        display: inline-flex; align-items: center; gap: 0.375rem;
        padding: 0.125rem 0.625rem; border-radius: 9999px;
        font-size: 0.75rem; font-weight: 500;
      }
      .dot { width: 6px; height: 6px; border-radius: 50%; }
      .online .dot, .healthy .dot, .running .dot, .synced .dot { background: hsl(var(--success)); }
      .online, .healthy, .running, .synced { background: hsl(var(--success) / 0.15); color: hsl(var(--success)); }
      .offline .dot, .error .dot, .stopped .dot { background: hsl(var(--destructive)); }
      .offline, .error, .stopped { background: hsl(var(--destructive) / 0.15); color: hsl(var(--destructive)); }
      .pending .dot, .warning .dot { background: hsl(var(--warning)); }
      .pending, .warning { background: hsl(var(--warning) / 0.15); color: hsl(var(--warning)); }
      .info .dot, .registered .dot { background: hsl(var(--info)); }
      .info, .registered { background: hsl(var(--info) / 0.15); color: hsl(var(--info)); }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const status = this.getAttribute("status") || "info";
      this._s.innerHTML = `<span class="badge ${status}"><span class="dot"></span>${status}</span>`;
    }
  }
  define("mm-status-badge", MmStatusBadge);

  // ── Dropdown Menu ──
  class MmDropdown extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-block; position: relative; }
      .menu {
        position: absolute; z-index: 50; min-width: 8rem;
        padding: 0.25rem; border-radius: var(--radius);
        border: 1px solid hsl(var(--border));
        background: hsl(var(--card)); color: hsl(var(--card-foreground));
        box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
        display: none; top: calc(100% + 4px); left: 0;
      }
      :host([open]) .menu { display: block; }
      :host([align="right"]) .menu { left: auto; right: 0; }
      .trigger { cursor: pointer; }
    `);
      this._s.innerHTML = '<div class="trigger"><slot name="trigger"></slot></div><div class="menu"><slot></slot></div>';
    }
    connectedCallback() {
      this._s.querySelector(".trigger")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleAttribute("open");
      });
      document.addEventListener("click", () => this.removeAttribute("open"));
    }
    disconnectedCallback() {
      document.removeEventListener("click", () => this.removeAttribute("open"));
    }
  }
  define("mm-dropdown", MmDropdown);

  // ── Dropdown Item ──
  class MmDropdownItem extends HTMLElement {
    static get observedAttributes() { return ["disabled"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      .item {
        display: flex; align-items: center; gap: 0.5rem; width: 100%;
        padding: 0.375rem 0.5rem; border-radius: calc(var(--radius) * 0.5);
        font-size: 0.875rem; cursor: pointer; border: none; background: none;
        color: inherit; font-family: inherit; text-align: left;
        transition: background 0.1s;
      }
      .item:hover { background: hsl(var(--accent)); }
      :host([disabled]) .item { opacity: 0.5; pointer-events: none; }
    `); this._s.innerHTML = '<button class="item"><slot></slot></button>'; }
    connectedCallback() {
      this._s.querySelector(".item")?.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("select", { bubbles: true }));
        this.closest("mm-dropdown")?.removeAttribute("open");
      });
    }
  }
  define("mm-dropdown-item", MmDropdownItem);

  // ── Dropdown Separator ──
  class MmDropdownSeparator extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; height: 1px; background: hsl(var(--muted)); margin: 0.25rem -0.25rem; }
    `); }
  }
  define("mm-dropdown-separator", MmDropdownSeparator);

  // ── Accordion ──
  class MmAccordion extends HTMLElement {
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; border: 1px solid hsl(var(--border)); border-radius: var(--radius); overflow: hidden; }
    `); this._s.innerHTML = "<slot></slot>"; }
  }
  define("mm-accordion", MmAccordion);

  // ── Accordion Item ──
  class MmAccordionItem extends HTMLElement {
    static get observedAttributes() { return ["open", "title"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; border-bottom: 1px solid hsl(var(--border)); }
      :host(:last-child) { border-bottom: none; }
      .header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.75rem 1rem; cursor: pointer; font-size: 0.875rem; font-weight: 500;
        transition: background 0.1s;
      }
      .header:hover { background: hsl(var(--accent) / 0.5); }
      .chevron { transition: transform 0.2s; font-size: 0.75rem; color: hsl(var(--muted-foreground)); }
      :host([open]) .chevron { transform: rotate(180deg); }
      .content { display: none; padding: 0 1rem 0.75rem; font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
      :host([open]) .content { display: block; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      this._s.innerHTML = `
        <div class="header"><span>${this.getAttribute("title") || ""}</span><span class="chevron">▼</span></div>
        <div class="content"><slot></slot></div>
      `;
      this._s.querySelector(".header")?.addEventListener("click", () => {
        this.toggleAttribute("open");
      });
    }
  }
  define("mm-accordion-item", MmAccordionItem);

  // ── Code Block ──
  class MmCode extends HTMLElement {
    static get observedAttributes() { return ["language"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: block; }
      pre {
        background: hsl(var(--muted)); padding: 1rem; border-radius: var(--radius);
        overflow-x: auto; font-size: 0.8125rem; line-height: 1.6;
      }
      code { font-family: "Fira Code", "JetBrains Mono", monospace; }
      .lang { font-size: 0.6875rem; color: hsl(var(--muted-foreground)); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
    `); }
    connectedCallback() { this._render(); }
    attributeChangedCallback() { this._render(); }
    _render() {
      const lang = this.getAttribute("language");
      this._s.innerHTML = `${lang ? `<div class="lang">${lang}</div>` : ""}<pre><code><slot></slot></code></pre>`;
    }
  }
  define("mm-code", MmCode);

  // ── Popover ──
  class MmPopover extends HTMLElement {
    static get observedAttributes() { return ["position"]; }
    constructor() { super(); this._s = shadow(this, css`
      :host { display: inline-block; position: relative; }
      .content {
        position: absolute; z-index: 50; padding: 0.75rem;
        border-radius: var(--radius); border: 1px solid hsl(var(--border));
        background: hsl(var(--popover)); color: hsl(var(--popover-foreground));
        box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
        min-width: 12rem; display: none;
      }
      :host([open]) .content { display: block; }
      :host(:not([position])) .content, :host([position="bottom"]) .content { top: calc(100% + 6px); left: 50%; transform: translateX(-50%); }
      :host([position="top"]) .content { bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); }
    `);
      this._s.innerHTML = '<div class="trigger"><slot name="trigger"></slot></div><div class="content"><slot></slot></div>';
    }
    connectedCallback() {
      this._s.querySelector(".trigger")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleAttribute("open");
      });
      document.addEventListener("click", () => this.removeAttribute("open"));
    }
  }
  define("mm-popover", MmPopover);

  // ── Registration complete ──
  console.log("[ModularMind] Components SDK loaded — 32 components registered");
})();
