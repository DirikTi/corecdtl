import path from "path";

const hypernode = require('node-gyp-build')(path.join(__dirname, '..'));

export default hypernode;