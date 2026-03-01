# joone-base: Pre-baked E2B sandbox template for production.
# All security and development tools are pre-installed for zero startup cost.
#
# Build command:
#   e2b template create --name joone-base --dockerfile ./e2b/Dockerfile
#
# Usage in config (~/.joone/config.json):
#   { "sandboxTemplate": "joone-base" }

FROM e2b/base

# Install Node.js tooling
RUN npm install -g @google/gemini-cli

# Install Gemini CLI security extension
RUN gemini extensions install https://github.com/gemini-cli-extensions/security

# Install OSV-Scanner for dependency vulnerability scanning
RUN curl -sSfL https://github.com/google/osv-scanner/releases/latest/download/osv-scanner_linux_amd64 \
    -o /usr/local/bin/osv-scanner && \
    chmod +x /usr/local/bin/osv-scanner

# Verify installations
RUN gemini --version && osv-scanner --version

WORKDIR /workspace
