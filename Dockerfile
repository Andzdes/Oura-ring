FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node scripts/serve-telegram-miniapp.mjs scripts/telegram-chat.mjs ./scripts/
COPY --chown=node:node web/telegram-status.html ./web/
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8766 DATA_DIR=/data
EXPOSE 8766
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8766/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/serve-telegram-miniapp.mjs"]
