#!/usr/bin/env bash
# ==========================================================================
# LIVRE BACKEND - Controle de versão
# --------------------------------------------------------------------------
# O arquivo VERSION na raiz é a fonte da verdade. Este script mantém os
# demais pontos sincronizados:
#   - services/admin-api/package.json
#   - services/auth/package.json
#   - services/visual-db/package.json
#   - panel/package.json
#   - panel/src/lib/version.ts  (exibido no painel)
#
# Uso:
#   ./scripts/version.sh                 # mostra a versão atual
#   ./scripts/version.sh show            # idem
#   ./scripts/version.sh check           # valida se tudo está sincronizado
#   ./scripts/version.sh set 0.2.0       # define uma versão exata
#   ./scripts/version.sh bump patch      # 0.2.0 -> 0.2.1
#   ./scripts/version.sh bump minor      # 0.2.1 -> 0.3.0
#   ./scripts/version.sh bump major      # 0.3.0 -> 1.0.0 (só quando estável)
#
# NUNCA altera a versão automaticamente em commits. A execução é manual.
# ==========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT/VERSION"
VERSION_TS="$ROOT/panel/src/lib/version.ts"
PACKAGE_FILES=(
  "$ROOT/services/admin-api/package.json"
  "$ROOT/services/auth/package.json"
  "$ROOT/services/visual-db/package.json"
  "$ROOT/panel/package.json"
)
SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'

die()  { printf 'erro: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }

current_version() {
  [ -f "$VERSION_FILE" ] || die "arquivo VERSION não encontrado em $VERSION_FILE"
  tr -d '[:space:]' < "$VERSION_FILE"
}

validate_semver() {
  printf '%s' "$1" | grep -Eq "$SEMVER_RE" || die "versão inválida: '$1' (esperado MAJOR.MINOR.PATCH)"
}

# Compara duas versões; retorna 0 se $1 >= $2
version_gte() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | tail -n1)" = "$1" ]
}

sync_version() {
  local new="$1"
  validate_semver "$new"

  printf '%s\n' "$new" > "$VERSION_FILE"

  local pkg
  for pkg in "${PACKAGE_FILES[@]}"; do
    [ -f "$pkg" ] || continue
    sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*)\"[^\"]*\"/\1\"${new}\"/" "$pkg"
  done

  mkdir -p "$(dirname "$VERSION_TS")"
  cat > "$VERSION_TS" <<EOF
// Arquivo gerado por scripts/version.sh — não editar manualmente.
// Fonte da verdade: VERSION na raiz do projeto.
export const APP_VERSION = '${new}';
EOF

  info "Versão definida para ${new}"
  info "  - VERSION"
  for pkg in "${PACKAGE_FILES[@]}"; do
    [ -f "$pkg" ] && info "  - ${pkg#$ROOT/}"
  done
  info "  - ${VERSION_TS#$ROOT/}"
}

cmd_show() {
  local cur
  cur="$(current_version)"
  info "Versão atual: ${cur}"
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    info "  commit:  $(git -C "$ROOT" rev-parse --short HEAD)"
    info "  branch:  $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
    if git -C "$ROOT" describe --tags --abbrev=0 >/dev/null 2>&1; then
      info "  tag:     $(git -C "$ROOT" describe --tags --abbrev=0)"
    else
      info "  tag:     (nenhuma)"
    fi
  fi
}

cmd_check() {
  local cur failures=0
  cur="$(current_version)"
  validate_semver "$cur"
  info "Verificando sincronização da versão ${cur}..."

  local pkg found
  for pkg in "${PACKAGE_FILES[@]}"; do
    [ -f "$pkg" ] || { info "  [falta] ${pkg#$ROOT/}"; failures=$((failures+1)); continue; }
    found="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$pkg" | head -n1)"
    if [ "$found" = "$cur" ]; then
      info "  [ ok ] ${pkg#$ROOT/}"
    else
      info "  [difere] ${pkg#$ROOT/} (encontrado: ${found:-?})"
      failures=$((failures+1))
    fi
  done

  if [ -f "$VERSION_TS" ] && grep -q "APP_VERSION = '${cur}'" "$VERSION_TS"; then
    info "  [ ok ] ${VERSION_TS#$ROOT/}"
  else
    info "  [difere] ${VERSION_TS#$ROOT/}"
    failures=$((failures+1))
  fi

  if [ -f "$ROOT/CHANGELOG.md" ] && grep -qF "## [${cur}]" "$ROOT/CHANGELOG.md"; then
    info "  [ ok ] CHANGELOG.md (seção ${cur})"
  else
    info "  [falta] CHANGELOG.md sem seção '## [${cur}]'"
    failures=$((failures+1))
  fi

  if [ "$failures" -gt 0 ]; then
    die "versão dessincronizada (${failures} problema(s)). Rode: ./scripts/version.sh set ${cur}"
  fi
  info "Tudo sincronizado."
}

cmd_set() {
  local new="${1:-}"
  [ -n "$new" ] || die "uso: ./scripts/version.sh set MAJOR.MINOR.PATCH"
  local force=0
  [ "${2:-}" = "--force" ] && force=1
  validate_semver "$new"

  local cur
  cur="$(current_version)"
  if [ "$new" != "$cur" ] && ! version_gte "$new" "$cur" && [ "$force" -ne 1 ]; then
    die "recusando reduzir a versão de ${cur} para ${new} (use --force se for intencional)"
  fi
  sync_version "$new"
}

cmd_bump() {
  local kind="${1:-}"
  case "$kind" in
    major|minor|patch) ;;
    *) die "uso: ./scripts/version.sh bump major|minor|patch" ;;
  esac

  local cur major minor patch
  cur="$(current_version)"
  validate_semver "$cur"
  IFS=. read -r major minor patch <<< "$cur"

  case "$kind" in
    major)
      if [ "$major" -eq 0 ]; then
        info "atenção: 0.x é fase de desenvolvimento."
        info "         Só vá para 1.0.0 quando a API estiver estável."
      fi
      major=$((major+1)); minor=0; patch=0 ;;
    minor) minor=$((minor+1)); patch=0 ;;
    patch) patch=$((patch+1)) ;;
  esac

  sync_version "${major}.${minor}.${patch}"
}

main() {
  local cmd="${1:-show}"
  [ $# -gt 0 ] && shift || true
  case "$cmd" in
    show)   cmd_show ;;
    check)  cmd_check ;;
    set)    cmd_set "$@" ;;
    bump)   cmd_bump "$@" ;;
    -h|--help|help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//' ;;
    *) die "comando desconhecido: $cmd (use --help)" ;;
  esac
}

main "$@"
