#!/usr/bin/env bash
# ==========================================================================
# LIVRE BACKEND - Publicação de versão (tag + GitHub Release)
# --------------------------------------------------------------------------
# Cria uma tag anotada no formato vX.Y.Z apontando para o commit atual.
# Por padrão NÃO altera nada: apenas valida e mostra o plano (dry-run).
#
# Uso:
#   ./scripts/release.sh                     # valida e mostra o plano
#   ./scripts/release.sh --confirm           # cria a tag localmente
#   ./scripts/release.sh --confirm --push    # cria e envia a tag ao GitHub
#   ./scripts/release.sh --confirm --push --github-release
#                                            # + cria a GitHub Release (gh)
#   ./scripts/release.sh --skip-tests        # não roda TEST_CMD
#   ./scripts/release.sh --help
#
# Garantias:
#   - Não cria tag duplicada (local ou remota).
#   - Não apaga nem move tags existentes.
#   - Não publica Release sem as flags explícitas acima.
#   - Exige árvore de trabalho limpa e versão sincronizada.
#
# Variáveis opcionais:
#   TEST_CMD   comando de testes (default: ./scripts/version.sh check)
# ==========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$ROOT/VERSION"
CHANGELOG="$ROOT/CHANGELOG.md"
TEST_CMD="${TEST_CMD:-}"

CONFIRM=0
PUSH=0
GH_RELEASE=0
SKIP_TESTS=0
ALLOW_DIRTY=0

die()  { printf 'erro: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }

usage() {
  sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --confirm)        CONFIRM=1 ;;
    --push)           PUSH=1 ;;
    --github-release) GH_RELEASE=1 ;;
    --skip-tests)     SKIP_TESTS=1 ;;
    --allow-dirty)    ALLOW_DIRTY=1 ;;
    -h|--help)        usage ;;
    *) die "argumento desconhecido: $1 (use --help)" ;;
  esac
  shift
done

[ -f "$VERSION_FILE" ] || die "VERSION não encontrado"
VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
TAG="v${VERSION}"

printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || die "VERSION inválido: '$VERSION'"

step "Versão"
info "VERSION:  ${VERSION}"
info "Tag:      ${TAG}"

step "Pré-condições"
git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "não é um repositório git"

if [ "$ALLOW_DIRTY" -ne 1 ]; then
  if ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet; then
    if [ "$CONFIRM" -eq 1 ]; then
      git -C "$ROOT" status --short >&2
      die "há alterações não commitadas. Faça commit (ou use --allow-dirty, não recomendado)."
    fi
    info "aviso: árvore de trabalho com alterações (ok em dry-run; bloqueia com --confirm)."
  fi
fi

# Tag duplicada? (local)
if git -C "$ROOT" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  die "a tag $TAG já existe localmente. Não sobrescrevemos tags."
fi

# Tag duplicada? (remota) — se não for possível verificar, apenas avisa.
REMOTE_URL="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
if [ -n "$REMOTE_URL" ]; then
  if REMOTE_TAGS="$(git -C "$ROOT" ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null)"; then
    if [ -n "$REMOTE_TAGS" ]; then
      die "a tag $TAG já existe no remoto. Não sobrescrevemos tags."
    fi
    info "Tag inexistente no remoto: ok"
  else
    info "aviso: não foi possível consultar as tags remotas (sem rede/chave?)."
  fi
else
  info "aviso: remoto 'origin' não configurado."
fi

# Versão sincronizada + seção no CHANGELOG
if [ "$SKIP_TESTS" -ne 1 ]; then
  step "Testes"
  if [ -n "$TEST_CMD" ]; then
    info "TEST_CMD: ${TEST_CMD}"
    ( cd "$ROOT" && sh -c "$TEST_CMD" )
  else
    info "Verificação padrão: scripts/version.sh check"
    "$ROOT/scripts/version.sh" check
  fi
else
  info "Testes ignorados (--skip-tests)."
fi

grep -qF "## [${VERSION}]" "$CHANGELOG" \
  || die "CHANGELOG.md não tem a seção '## [${VERSION}]'"

STEP="$(git -C "$ROOT" rev-parse --short HEAD)"
STEP_FULL="$(git -C "$ROOT" rev-parse HEAD)"
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"

step "Plano"
info "Commit:  ${STEP} (${BRANCH})"
info "Mensagem: Release ${TAG}"
info "Ações:"
info "  [1] criar tag anotada ${TAG} localmente"
[ "$PUSH" -eq 1 ]         && info "  [2] git push origin ${TAG}"
[ "$GH_RELEASE" -eq 1 ]   && info "  [3] criar GitHub Release ${TAG} (gh)"
[ "$GH_RELEASE" -eq 1 ] && [ "$PUSH" -ne 1 ] && die "--github-release exige --push"

if [ "$CONFIRM" -ne 1 ]; then
  info ""
  info "Dry-run: nada foi alterado. Reexecute com --confirm para publicar."
  exit 0
fi

step "Criando tag"
git -C "$ROOT" tag -a "$TAG" -m "Release ${TAG}"
info "Tag ${TAG} criada em ${STEP_FULL}."

if [ "$PUSH" -eq 1 ]; then
  step "Enviando tag"
  git -C "$ROOT" push origin "$TAG"
  info "Tag enviada para origin."
fi

if [ "$GH_RELEASE" -eq 1 ]; then
  command -v gh >/dev/null 2>&1 || die "GitHub CLI (gh) não encontrado; a tag foi criada, a Release não."
  step "Criando GitHub Release"
  NOTES="$(awk -v ver="$VERSION" '
    $0 ~ "^## \\[" ver "\\]" { flag=1; next }
    flag && /^## \[/ { exit }
    flag { print }
  ' "$CHANGELOG")"
  [ -n "$NOTES" ] || die "não foi possível extrair as notas do CHANGELOG"
  PRERELEASE=()
  case "$VERSION" in 0.*) PRERELEASE=(--prerelease) ;; esac
  printf '%s\n' "$NOTES" | gh release create "$TAG" \
    --title "$TAG" \
    --notes-file - \
    "${PRERELEASE[@]+"${PRERELEASE[@]}"}"
  info "GitHub Release ${TAG} publicada."
fi

info ""
info "Concluído."
