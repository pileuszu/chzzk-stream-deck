export const CHAT_THEMES = [
    { id: 'simple-purple', label: 'Simple Purple', description: '로켓과 보라색 말풍선' },
    { id: 'neon-green', label: 'Neon Green', description: '어두운 배경과 네온 포인트' },
    { id: 'clean', label: 'Clean', description: '담백한 흰색 말풍선' }
];
export const chatTheme = value => CHAT_THEMES.some(theme => theme.id === value) ? value : CHAT_THEMES[0].id;
