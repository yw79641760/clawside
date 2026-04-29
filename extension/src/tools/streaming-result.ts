// ClawSide - StreamingResult Component
// Accumulates chunks, renders incrementally via RAF for typing effect.

class StreamingResult {
  constructor({ element }) {
    this.element = element;
    this._raw = '';
    this._rafId = null;
  }

  reset() {
    this._raw = '';
    this.element.textContent = '';
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  appendChunk(text) {
    this._raw += text;
  }

  // Append chunk and schedule render via requestAnimationFrame
  appendChunkAndFlush(text) {
    this._raw += text;
    this._scheduleRender();
  }

  _scheduleRender() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this.flush();
    });
  }

  showCard() {
    this.element.closest('.result-card')?.classList.remove('hidden');
  }

  flush() {
    this.element.innerHTML = marked.parse(this._raw);
  }

  getRawText() {
    return this._raw;
  }
}

window.StreamingResult = StreamingResult;