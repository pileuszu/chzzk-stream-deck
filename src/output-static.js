// Decode before checking: express.static decodes encoded slashes and dot segments too.
function blockOutputFiles(req, res, next) {
    let requestPath;
    try { requestPath = require('node:path').posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')).toLowerCase(); }
    catch { return res.sendStatus(400); }
    if (/^\/(?:native|native-runtime|test|test-results)(?:\/|$)/.test(requestPath) ||
        /^\/src\/output-[^/]+\.js$/.test(requestPath)) return res.sendStatus(404);
    return next();
}

module.exports = blockOutputFiles;
