// Offline child fixture: never contacts a streaming service.
process.on('message', message => {
    if (message.type === 'shutdown') process.exit(0);
});
process.on('disconnect', () => process.exit(0));
process.send?.({ ready: true });
setInterval(() => {}, 1000);
