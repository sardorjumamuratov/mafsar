# Builds and runs the Mafsar backend (server/) from the repo root, so Railway
# doesn't need a Root Directory setting. A Dockerfile at the build-context root
# takes precedence over Railpack/Nixpacks.
FROM node:22-slim

WORKDIR /app

# Install deps first (better layer caching). libSQL ships prebuilt linux-x64-gnu
# binaries, so node:22-slim (Debian/glibc) needs no compilers.
COPY server/package.json server/package-lock.json ./
# `stripe` was added to package.json but package-lock.json wasn't regenerated,
# so `npm ci` (which requires the two in sync) fails the build. Use `npm install`
# until the lock is regenerated and committed, then switch back to `npm ci`.
RUN npm install --no-audit --no-fund

# App source
COPY server/ ./

# Railway injects PORT; the app reads process.env.PORT.
CMD ["npm", "start"]
