FROM node:22.14.0-bookworm-slim
# 官方发行包与真实命令：https://github.com/agentscope-ai/agentscope-studio
# 独立工具镜像，不参与 Java/React 构建或启动。
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && npm install --global @agentscope/studio@1.0.9 \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production LOG_LEVEL=warn PORT=3000 HOME=/app/data
USER node
WORKDIR /app/data
EXPOSE 3000
CMD ["as_studio"]
