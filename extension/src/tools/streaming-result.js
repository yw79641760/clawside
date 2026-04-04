// ClawSide - StreamingResult Component
// Encapsulates raw-text buffer + RAF-throttled innerHTML rendering for markdown result areas.
// Used by sidepanel.js. Depends on `marked` (loaded via sidepanel.html <script src="marked.min.js">).

class StreamingResult {
  /**
   * @param {{ element: HTMLElement }} options
   */
  constructor({ element }) {
    this.element = element;   // the .result-body div
    this._raw = '';           // accumulated raw markdown
    this._pending = false;   // RAF already scheduled flag
  }

  /** Clear buffer and DOM before a new run. */
  reset() {
    this._raw = '';
    this._pending = false;
    this.element.textContent = '';
  }

  /** Append a streaming chunk. RAF-throttled: renders ~once per frame. */
  appendChunk(text) {
    this._raw += text;
    console.log('[StreamingResult] appendChunk called, accumulated:', this._raw.length, 'chars');
    this._schedule();
  }

  /** Show the result card. Call after first chunk. */
  showCard() {
    this.element.closest('.result-card')?.classList.remove('hidden');
  }

  /** Force a synchronous final render. Call when stream ends. */
  flush() {
    // Cancel any pending RAF and render immediately
    this._pending = false;
    console.log('[StreamingResult] flush called, rendering', this._raw.length, 'chars');
    this.element.innerHTML = marked.parse(this._raw);
  }

  /** Plain markdown text for history storage and copy. */
  getRawText() {
    return this._raw;
  }

  _schedule() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this.element.innerHTML = marked.parse(this._raw);
    });
  }
}

// Expose globally for non-module scripts (sidepanel.html uses <script> not type="module")
window.StreamingResult = StreamingResult;
