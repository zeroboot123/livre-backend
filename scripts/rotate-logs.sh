#!/bin/bash
# ==============================================================
# LIVRE BACKEND - Rotação de Logs Docker
# ==============================================================
# Remove logs de containers parados e reduz logs antigos

echo "🔵 Removendo logs de containers parados..."
docker container prune --force

echo "🔵 Limitando logs a 10MB por container..."
for container in $(docker ps -q); do
    log_path=$(docker inspect --format='{{.LogPath}}' "$container")
    if [ -f "$log_path" ] && [ "$(stat -c%s "$log_path")" -gt 10485760 ]; then
        truncate -s 10M "$log_path"
        echo "  ✅ Log truncado: ${container:0:12}"
    fi
done

echo "✅ Rotação de logs concluída!"
