#!/usr/bin/env bash

# ===> COMMON SECTION START  ===>

# http://bash.cumulonim.biz/NullGlob.html
shopt -s nullglob
# -------------------------------
this_folder="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
if [ -z "$this_folder" ]; then
  this_folder=$(dirname $(readlink -f $0))
fi
parent_folder=$(dirname "$this_folder")
# -------------------------------
debug(){
    local __msg="$1"
    echo " [DEBUG] `date` ... $__msg "
}

info(){
    local __msg="$1"
    echo " [INFO]  `date` ->>> $__msg "
}

warn(){
    local __msg="$1"
    echo " [WARN]  `date` *** $__msg "
}

err(){
    local __msg="$1"
    echo " [ERR]   `date` !!! $__msg "
}
# ---------- CONSTANTS ----------
export FILE_VARIABLES=${FILE_VARIABLES:-".variables"}
export FILE_LOCAL_VARIABLES=${FILE_LOCAL_VARIABLES:-".local_variables"}
export FILE_SECRETS=${FILE_SECRETS:-".secrets"}
export NAME="bashutils"
export INCLUDE_FILE=".${NAME}"
export TAR_NAME="${NAME}.tar.bz2"
# -------------------------------
if [ ! -f "$this_folder/$FILE_VARIABLES" ]; then
  warn "we DON'T have a $FILE_VARIABLES variables file - creating it"
  touch "$this_folder/$FILE_VARIABLES"
else
  . "$this_folder/$FILE_VARIABLES"
fi

if [ ! -f "$this_folder/$FILE_LOCAL_VARIABLES" ]; then
  warn "we DON'T have a $FILE_LOCAL_VARIABLES variables file - creating it"
  touch "$this_folder/$FILE_LOCAL_VARIABLES"
else
  . "$this_folder/$FILE_LOCAL_VARIABLES"
fi

if [ ! -f "$this_folder/$FILE_SECRETS" ]; then
  warn "we DON'T have a $FILE_SECRETS secrets file - creating it"
  touch "$this_folder/$FILE_SECRETS"
else
  . "$this_folder/$FILE_SECRETS"
fi

# ---------- include bashutils ----------
. ${this_folder}/${INCLUDE_FILE}

# ---------- FUNCTIONS ----------

update_bashutils(){
  echo "[update_bashutils] ..."

  tar_file="${NAME}.tar.bz2"
  _pwd=`pwd`
  cd "$this_folder"

  curl -s https://api.github.com/repos/jtviegas/bashutils/releases/latest \
  | grep "browser_download_url.*${NAME}\.tar\.bz2" \
  | cut -d '"' -f 4 | wget -qi -
  tar xjpvf $tar_file
  if [ ! "$?" -eq "0" ] ; then echo "[update_bashutils] could not untar it" && cd "$_pwd" && return 1; fi
  rm $tar_file

  cd "$_pwd"
  echo "[update_bashutils] ...done."
}

# <=== COMMON SECTION END  <===
# -------------------------------------

# =======>    MAIN SECTION    =======>

# ---------- LOCAL CONSTANTS ----------
export INFRA_DIR="${this_folder}/infrastructure"
export APP_DIR="${this_folder}/app"
export LIB_DIR="${this_folder}/library"

# ---------- LOCAL FUNCTIONS ----------
global_infra_reqs(){
  info "[global_infra_reqs|in]"

  info "[global_infra_reqs] installing: typescript@${TYPESCRIPT_VERSION} and  aws-cdk@${CDK_VERSION}"
  npm install -g "typescript@${TYPESCRIPT_VERSION}" "aws-cdk@${CDK_VERSION}" 
  result="$?"

  [ "$result" -ne "0" ] && err "[global_infra_reqs|out]  => ${result}" && exit 1
  info "[global_infra_reqs|out] => ${result}"
}

npm_deps(){
  info "[npm_deps|in] ({$1})"

  [ -z "$1" ] && usage
  _dir="$1"
  _pwd=`pwd`
  cd "$_dir"

  npm install

  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[npm_deps|out]  => ${result}" && exit 1
  info "[npm_deps|out] => ${result}"
}

generate_certificate_assets(){
  info "[generate_certificate_assets|in] ({$1})"

  [ -z "$1" ] && usage
  _dir="$1"
  _pwd=`pwd`
  cd "$_dir"

  npm install

  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[npm_deps|out]  => ${result}" && exit 1
  info "[generate_certificate_assets|out] => ${result}"
}

lib_test(){
  info "[lib_test|in] ({$1})"

  [ -z "$1" ] && usage
  _dir="$1"
  _pwd=`pwd`
  cd "$_dir"

  npm run test

  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[lib_test|out]  => ${result}" && exit 1
  info "[lib_test|out] => ${result}"
}

lib_deps(){
  info "[lib_deps|in] ({$1})"

  [ -z "$1" ] && usage
  _dir="$1"
  _pwd=`pwd`
  cd "$_dir"

  npm ci

  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[lib_deps|out]  => ${result}" && exit 1
  info "[lib_deps|out] => ${result}"
}

lib_build(){
  info "[lib_build|in] ({$1})"

  [ -z "$1" ] && usage
  _dir="$1"
  _pwd=`pwd`
  cd "$_dir"

  npm run build

  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[lib_build|out]  => ${result}" && exit 1
  info "[lib_build|out] => ${result}"
}

# -------------------------------------
usage() {
  cat <<EOM
  usage:
  $(basename $0) { option }
      options:
      - commands: lists handy commands we use all the time
      - lib:
        - publish:  publishes package to npm
        - test:     run library tests
        - deps:     install lib dependencies
        - build:    build/compile lib code
      - infra: 
        - reqs: install requirements globally required in the sytem for IaC
        - deps: installs infra code dependencies
        - on: deploys infra
        - off: destroys infra
        - bootstrap
      - infra_domains: 
        - on: deploys dns subdomains infra
        - off: destroys subdomains infra
EOM
  exit 1
}

debug "1: $1 2: $2 3: $3 4: $4 5: $5 6: $6 7: $7 8: $8 9: $9"

case "$1" in
  commands)
    commands
    ;;
  bashutils)
    case "$2" in
      package)
        package
        ;;
      update)
        update_bashutils
        ;;
      *)
        usage
        ;;
    esac
    ;;
  lib)
    case "$2" in
      build)
        lib_build "$LIB_DIR"
        ;;
      deps)
        lib_deps "$LIB_DIR"
        ;;
      test)
        lib_test "$LIB_DIR"
        ;;
      publish)
        npm_publish "$NPM_REGISTRY" "$NPM_TOKEN" "$LIB_DIR"
        ;;
      *)
        usage
        ;;
    esac
    ;;
  infra)
    case "$2" in
      reqs)
        global_infra_reqs
        ;;
      deps)
        npm_deps "$INFRA_DIR"
        ;;
      on)
        cdk_infra on "$INFRA_DIR" "$STACK_SERVICE"
        ;;
      off)
        cdk_infra off "$INFRA_DIR" "$STACK_SERVICE"
        ;;
      bootstrap)
        cdk_infra bootstrap "$INFRA_DIR"
        ;;
      *)
        usage
        ;;
    esac
    ;;
  infra_domains)
    case "$2" in
      on)
        cdk_infra on "$INFRA_DIR" "$STACK_SUBDOMAINS"
        ;;
      off)
        cdk_infra off "$INFRA_DIR" "$STACK_SUBDOMAINS"
        ;;
      *)
        usage
        ;;
    esac
    ;;
  *)
    usage
    ;;
esac