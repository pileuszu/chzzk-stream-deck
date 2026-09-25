(function (root, factory) {
    const config = factory();
    if (typeof module === 'object' && module.exports) module.exports = config;
    root.StreamDeckConfig = config;
})(globalThis, function () {
    const THEMES = Object.freeze([
        { id: 'simple-purple', label: 'Simple Purple', description: '로켓과 보라색 말풍선' },
        { id: 'unicorn-overlord', label: 'Unicorn Overlord', description: '양피지와 금빛 장식' },
        { id: 'maplestory', label: 'Maplestory', description: '단풍잎과 크림색 말풍선' }
    ]);
    const DEFAULT_SETTINGS = Object.freeze({ theme: 'simple-purple', channelId: '', maxMessages: 5,
        alignment: 'default', fadeTime: 0, maxNicknameLength: 5 });
    const chatTheme = value => THEMES.some(theme => theme.id === value) ? value : 'simple-purple';
    function validateSettings(patch, current = DEFAULT_SETTINGS) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('설정 형식이 올바르지 않습니다.');
        const next = { ...DEFAULT_SETTINGS, ...current };
        const ranges = { maxMessages: [1, 100], fadeTime: [0, 300], maxNicknameLength: [1, 50] };
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (!Object.hasOwn(patch, key)) continue;
            const value = patch[key];
            if (key === 'theme') {
                if (!THEMES.some(theme => theme.id === value)) throw new Error('지원하지 않는 채팅 테마입니다.');
                next.theme = value;
            } else if (key === 'channelId') {
                if (typeof value !== 'string' || (value && !/^[a-z\d]{32}$/i.test(value))) throw new Error('32자리 채널 ID를 입력해 주세요.');
                next.channelId = value;
            } else if (key === 'alignment') {
                if (!['default', 'left', 'center', 'right'].includes(value)) throw new Error('채팅 정렬을 확인해 주세요.');
                next.alignment = value;
            } else {
                const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
                const [min, max] = ranges[key];
                if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${key}: ${min}~${max} 사이의 정수를 입력해 주세요.`);
                next[key] = number;
            }
        }
        return next;
    }
    // Only migration accepts the two themes accidentally introduced in v3.0.
    function migrateSettings(value) {
        const next = { ...DEFAULT_SETTINGS };
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (value?.[key] == null) continue;
            try { Object.assign(next, validateSettings({ [key]: key === 'theme' ? chatTheme(value[key]) : value[key] }, next)); }
            catch { /* Keep a valid default for a malformed legacy field. */ }
        }
        return next;
    }
    return { THEMES, DEFAULT_SETTINGS, chatTheme, validateSettings, migrateSettings };
});
