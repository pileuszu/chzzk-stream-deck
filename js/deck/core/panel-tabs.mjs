// Reusable tabs: preserve form values, support keyboard navigation, reveal invalid fields.
export class PanelTabs {
    constructor(root, { tabAttribute, panelAttribute, signal, isActive = () => true }) {
        this.root = root;
        this.tabAttribute = tabAttribute;
        this.panelAttribute = panelAttribute;
        this.tabs = [...root.querySelectorAll('[' + tabAttribute + ']')];
        this.pages = [...root.querySelectorAll('[' + panelAttribute + ']')];
        this.tabs.forEach((tab, index) => {
            const name = tab.getAttribute(tabAttribute);
            const page = this.pages.find(element => element.getAttribute(panelAttribute) === name);
            if (!page) throw new Error('Missing panel page: ' + name);
            tab.id ||= root.id + '-' + name + '-tab';
            page.id ||= root.id + '-' + name + '-page';
            tab.parentElement.setAttribute('role', 'tablist');
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', page.id);
            page.setAttribute('role', 'tabpanel');
            page.setAttribute('aria-labelledby', tab.id);
            tab.addEventListener('click', () => { if (isActive()) this.select(name); }, { signal });
            tab.addEventListener('keydown', event => {
                if (!isActive() || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length;
                this.select(this.tabs[next].getAttribute(tabAttribute));
                this.tabs[next].focus();
            }, { signal });
        });
        root.addEventListener('invalid', event => {
            if (!isActive()) return;
            // Native validation focuses the first invalid control after dispatching all invalid events.
            const firstInvalid = [...root.querySelectorAll(':invalid')].find(element => element.willValidate) || event.target;
            if (event.target !== firstInvalid) event.preventDefault();
            const page = this.pages.find(element => element.contains(firstInvalid));
            if (page) this.select(page.getAttribute(panelAttribute));
        }, { signal, capture: true });
        if (this.tabs.length) this.select(this.tabs[0].getAttribute(tabAttribute));
    }
    select(name) {
        if (!this.tabs.some(tab => tab.getAttribute(this.tabAttribute) === name)) return false;
        this.active = name;
        this.tabs.forEach(tab => {
            const selected = tab.getAttribute(this.tabAttribute) === name;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        });
        this.pages.forEach(page => { page.hidden = page.getAttribute(this.panelAttribute) !== name; });
        this.root.querySelector('.panel-body').scrollTop = 0;
        this.root.dispatchEvent(new CustomEvent('panel-tab-change', { detail: { name } }));
        return true;
    }
}
