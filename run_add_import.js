const fs = require('fs');
let code = fs.readFileSync('src/ui/panel.js', 'utf8');
code = code.replace('import { getAuth, register, login, logout } from "../sync/auth.js";', 'import { getAuth, register, login, logout, googleSignIn } from "../sync/auth.js";');
fs.writeFileSync('src/ui/panel.js', code);
