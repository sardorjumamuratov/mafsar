# Builds and runs the Mafsar backend (server/) from the repo root, so Railway
# doesn't need a Root Directory setting. A Dockerfile at the build-context root
# takes precedence over Railpack/Nixpacks.
FROM node:22-slim

WORKDIR /app/server

# Install deps first (better layer caching). libSQL ships prebuilt linux-x64-gnu
# binaries, so node:22-slim (Debian/glibc) needs no compilers.
COPY server/package.json server/package-lock.json ./
RUN npm ci

# App source
COPY server/ ./
COPY landing/ ../landing/

# Railway injects PORT; the app reads process.env.PORT.
CMD ["npm", "start"]
