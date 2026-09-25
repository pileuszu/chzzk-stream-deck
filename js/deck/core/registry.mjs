import { DeckModule } from './module.mjs';

export class ModuleRegistry {
    #modules = new Map();
    register(module) {
        if (!(module instanceof DeckModule)) throw new TypeError('Modules must extend DeckModule');
        if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(module.id)) throw new TypeError('Invalid module id');
        if (this.#modules.has(module.id)) throw new Error('Duplicate module: ' + module.id);
        if (module.fixedSlot !== null) {
            if (![11, 15].includes(module.fixedSlot) || module.assignable) throw new Error('Navigation is fixed at slots 11 and 15');
            if (this.fixedAt(module.fixedSlot)) throw new Error('Duplicate fixed slot: ' + module.fixedSlot);
        }
        this.#modules.set(module.id, module);
        return this;
    }
    get(id) { return this.#modules.get(id); }
    get all() { return [...this.#modules.values()]; }
    get assignable() { return this.all.filter(module => module.assignable); }
    hasAssignable(id) { return Boolean(this.get(id)?.assignable); }
    fixedAt(slot) { return this.all.find(module => module.fixedSlot === slot); }
    unregister(id) { this.get(id)?.dispose(); this.#modules.delete(id); }
    dispose() { this.all.forEach(module => module.dispose()); }
}
