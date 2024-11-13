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
export TEST_DEPLOY_INFRA_DIR="${this_folder}/test/infrastructure"
export TEST_FRONTEND_DIR="${this_folder}/test/resources/frontend"

# ---------- LOCAL FUNCTIONS ----------
cdk_global_reqs(){
  info "[cdk_global_reqs|in]"
  #info "[cdk_global_reqs] installing: typescript@${TYPESCRIPT_VERSION} and aws-cdk@${CDK_VERSION}"
  npm install -g "typescript@${TYPESCRIPT_VERSION}" "aws-cdk@${CDK_VERSION}" 
  result="$?"
  [ "$result" -ne "0" ] && err "[cdk_global_reqs|out]  => ${result}" && exit 1
  info "[cdk_global_reqs|out] => ${result}"
}

infra_reqs(){
  info "[infra_reqs|in]"

  [ -z "$1" ] && usage
  infra_dir="$1"
  _pwd=`pwd`
  cd "$infra_dir"

  cdk_global_reqs

  npm install 
  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[infra_reqs|out]  => ${result}" && exit 1
  info "[infra_reqs|out] => ${result}"
}

ui_config(){
  info "[ui_config|in] ({$1})"

  [ -z "$1" ] && usage
  ui_dir="$1"

  outputs=$(aws cloudformation describe-stacks --stack-name "$INFRA_STACK" --query 'Stacks[0].Outputs' --output=json)
  backendUrl=$(echo "$outputs" | jq -r ".[] | select(.OutputKey == \"$OUTPUT_SPA_URL\") | .OutputValue")

  info "[ui_config] clientId: $clientId   |   signInUrl: $signInUrl"

  jq --arg loginUrl "$signInUrl" '.loginUrl |= $loginUrl' "${ui_dir}/src/config.json" > "${ui_dir}/src/new_config.json"
  jq --arg authUrl "$authUrl" '.authUrl |= $authUrl' "${ui_dir}/src/new_config.json" > "${ui_dir}/src/tmp_config.json"
  jq --arg clientId "$clientId" '.clientId |= $clientId' "${ui_dir}/src/tmp_config.json" > "${ui_dir}/src/new_config.json"
  jq --arg protectedUrl "$protectedUrl" '.protectedUrl |= $protectedUrl' "${ui_dir}/src/new_config.json" > "${ui_dir}/src/tmp_config.json"
  jq --arg domain "$domain" '.domain |= $domain' "${ui_dir}/src/tmp_config.json" > "${ui_dir}/src/new_config.json"
  jq --arg local false '.local |= $local' "${ui_dir}/src/new_config.json" > "${ui_dir}/src/config.json"
  jq '.' "${ui_dir}/src/config.json"
  rm "${ui_dir}/src/new_config.json" "${ui_dir}/src/tmp_config.json"

  result="$?"
  [ "$result" -ne "0" ] && err "[ui_config|out]  => ${result}" && exit 1
  info "[ui_config|out] => ${result}"
}

ui_upload(){
  info "[ui_upload|in] ({$1}, {$2})"

  [ -z "$1" ] && usage
  build_dir="$1/build"
  [ -z "$2" ] && usage
  bucket_url="$2"

  aws s3 rm "$bucket_url" --recursive
  aws s3 cp "$build_dir" "$bucket_url" --recursive

  result="$?"
  [ "$result" -ne "0" ] && err "[ui_upload|out]  => ${result}" && exit 1
  info "[ui_upload|out] => ${result}"
}

run_local(){
  info "[run_local|in] ({$1})"

  [ -z "$1" ] && usage
  ui_dir="$1"
  _pwd=`pwd`
  cd "$ui_dir"

  cp "${ui_dir}/src/config.json" "${ui_dir}/src/new_config.json"
  jq --arg local true '.local |= $local' "${ui_dir}/src/new_config.json" > "${ui_dir}/src/config.json"
  jq '.' "${ui_dir}/src/config.json"
  rm "${ui_dir}/src/new_config.json"

  npm run start

  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[run_local|out]  => ${result}" && exit 1
  info "[run_local|out] => ${result}"
}

# -------------------------------------
usage() {
  cat <<EOM
  usage:
  $(basename $0) { option }
      options:
      - bashutils:  updates bashutils include file
      - commands: lists handy commands we use all the time
      - publish:  publishes package to npm
      - test:     run library tests
      - deps:     install lib dependencies
      - build:    build/compile lib code
      - test_frontend:    runs test frontend app
      - deployment_test:
        - setup: sets up the cdk environment for testing the deployment
        - on: deploys cdk test infrastructure
        - off: destroys cdk test infrastructure
EOM
  exit 1
}

debug "1: $1 2: $2 3: $3 4: $4 5: $5 6: $6 7: $7 8: $8 9: $9"

case "$1" in
  commands)
    commands
    ;;
  bashutils)
    update_bashutils
    ;;
  build)
    npm run build
    ;;
  deps)
    npm ci
    ;;
  test)
    npm run test
    ;;
  test_ui)
    case "$2" in
      reqs)
        npm_deps "$TEST_FRONTEND_DIR"
        ;;
      build)
        ui_build "$TEST_FRONTEND_DIR"
        ;;
      config)
        ui_config "$TEST_FRONTEND_DIR"
        ;;
      upload)
        ui_upload "$TEST_FRONTEND_DIR" "s3://${SPA_BUCKET}"
        ;;
      run_local)
        run_local "$TEST_FRONTEND_DIR"
        ;;
      *)
        usage
        ;;
    esac
    ;;
  publish)
    npm_publish "$NPM_REGISTRY" "$NPM_TOKEN" "$this_folder"
    ;;
  deployment_test)
    case "$2" in
      reqs)
        infra_reqs
        ;;
      on)
        cdk_infra on "$TEST_DEPLOY_INFRA_DIR" "$3"
        ;;
      off)
        cdk_infra off "$TEST_DEPLOY_INFRA_DIR" "$3"
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