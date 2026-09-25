// Paint the original slices onto one surface. Adjacent slices share integer
// backing-pixel edges, so iframe scaling cannot expose separate CSS paint seams.
const files = {
    message: ['Unicorn_Side.png', 'Unicorn_Center.png', 'Unicorn_Side.png'],
    name: ['Unicorn_Name_Left.png', 'Unicorn_Name_Center.png', 'Unicorn_Name_Right.png']
};
const images = new Map();
const loadImage = name => {
    if (!images.has(name)) {
        const image = new Image();
        image.src = '/assets/images/' + name;
        images.set(name, image.decode().then(() => image));
    }
    return images.get(name);
};
const observer = new ResizeObserver(entries => {
    for (const entry of entries) entry.target.paint();
});
export class UnicornFrame extends HTMLElement {
    connectedCallback() {
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.setAttribute('aria-hidden', 'true');
            this.append(this.canvas);
        }
        observer.observe(this, { box: 'device-pixel-content-box' });
        const kind = this.getAttribute('kind') === 'name' ? 'name' : 'message';
        this.mirrorLeft = kind === 'message';
        this.ready = Promise.all(files[kind].map(loadImage)).then(parts => {
            this.parts = parts;
            if (this.isConnected) this.paint();
        }).catch(error => console.warn('채팅 프레임 이미지를 불러오지 못했습니다:', error.message));
    }
    disconnectedCallback() { observer.unobserve(this); }
    paint() {
        if (!this.parts || !this.isConnected) return;
        const width = Math.max(1, Math.round(this.clientWidth * devicePixelRatio));
        const height = Math.max(1, Math.round(this.clientHeight * devicePixelRatio));
        if (this.canvas.width === width && this.canvas.height === height && this.painted) return;
        this.canvas.width = width;
        this.canvas.height = height;
        const [left, center, right] = this.parts;
        const leftWidth = Math.min(Math.floor(width / 2), Math.round(height * left.naturalWidth / left.naturalHeight));
        const rightWidth = Math.min(width - leftWidth, Math.round(height * right.naturalWidth / right.naturalHeight));
        const context = this.canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (this.mirrorLeft) {
            context.save(); context.translate(leftWidth, 0); context.scale(-1, 1);
            context.drawImage(left, 0, 0, leftWidth, height); context.restore();
        } else context.drawImage(left, 0, 0, leftWidth, height);
        if (width > leftWidth + rightWidth) context.drawImage(center, leftWidth, 0, width - leftWidth - rightWidth, height);
        context.drawImage(right, width - rightWidth, 0, rightWidth, height);
        this.painted = true;
    }
}
customElements.define('unicorn-frame', UnicornFrame);
