// State polling is separate from the deck layout so keys can be reassigned safely.
class OutputModuleCards {
    constructor() {
        this.api = window.outputModules;
        this.busy = false;
        this.state = null;
        document.addEventListener('visibilitychange', () => {
            clearTimeout(this.timer);
            if (!document.hidden && this.api) this.refresh();
        });
        if (this.api && !document.hidden) this.refresh();
        else this.render();
    }
    render() { window.deck?.setOutputs(this.state); }
    message(text, error = false) { window.deck?.notify(text, error); }
    async refresh() {
        clearTimeout(this.timer);
        if (this.refreshing || document.hidden) return;
        this.refreshing = true;
        try {
            const reply = await this.api.status();
            if (!reply.ok) throw new Error(reply.error);
            this.state = reply.data;
        } catch (error) {
            this.state = null;
            this.message(error.message, true);
        } finally {
            this.render();
            this.refreshing = false;
            if (!document.hidden) this.timer = setTimeout(() => this.refresh(), 3000);
        }
    }
    action(action) { return this.request('action', action); }
    configure(payload) { return this.request('configure', payload); }
    async request(method, payload) {
        if (this.busy || !this.api) return;
        this.busy = true;
        this.lastError = '';
        this.render();
        this.message('처리 중…');
        try {
            const reply = await this.api[method](payload);
            if (!reply.ok) throw new Error(reply.error);
            this.message(reply.data.message);
            return true;
        } catch (error) { this.lastError = error.message; this.message(error.message, true); return false; }
        finally {
            try { const status = await this.api.status(); if (status.ok) this.state = status.data; } catch {}
            this.busy = false; this.render();
        }
    }
}
