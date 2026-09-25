import { ModuleRegistry } from './core/registry.mjs';
import { ObsDeckModule } from './modules/obs.mjs';
import { NdiDeckModule } from './modules/ndi.mjs';
import { ChatDeckModule } from './modules/chat.mjs';
import { PreviousPageModule, NextPageModule } from './modules/pages.mjs';
import { EmptySlotModule } from './modules/empty.mjs';

// Extension point: register another DeckModule subclass here. Layouts add it to the first free slot.
export function createModuleRegistry() {
    return new ModuleRegistry()
        .register(new ObsDeckModule())
        .register(new NdiDeckModule())
        .register(new ChatDeckModule())
        .register(new PreviousPageModule())
        .register(new NextPageModule())
        .register(new EmptySlotModule());
}
