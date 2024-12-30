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
export CLOUDFRONT_CIDR_FILE="${TEST_DEPLOY_INFRA_DIR}/cloudfront_cidr.json"
export TEST_FRONTEND_DIR="${this_folder}/test/resources/frontend"


# ---------- LOCAL FUNCTIONS ----------
cdk_global_reqs(){
  info "[cdk_global_reqs|in]"
  #info "[cdk_global_reqs] installing: typescript@${TYPESCRIPT_VERSION} and aws-cdk@${CDK_VERSION}"
  npm install -g "typescript@${TYPESCRIPT_VERSION}" "aws-cdk@${CDK_VERSION}" ts-node @aws-cdk/integ-runner @aws-cdk/integ-tests-alpha
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

ui_build(){
  info "[ui_build|in] ({$1})"

  [ -z "$1" ] && usage
  _dir="$1"
  _pwd=`pwd`
  cd "$_dir"

  npm run build

  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[ui_build|out]  => ${result}" && exit 1
  info "[ui_build|out] => ${result}"
}

ui_config(){
  info "[ui_config|in] ({$1})"

  [ -z "$1" ] && usage
  ui_dir="$1"
  [ -z "$2" ] && usage
  local stack="$2"
  [ -z "$3" ] && usage
  local outputUrl="$3"

  outputs=$(aws cloudformation describe-stacks --stack-name "$stack" --query 'Stacks[0].Outputs' --output=json)
  backendUrl=$(echo "$outputs" | jq -r ".[] | select(.ExportName == \"${outputUrl}\") | .OutputValue")

  info "[ui_config] backendUrl: $backendUrl"

  jq --arg backendUrl "$backendUrl" '.backendUrl |= $backendUrl' "${ui_dir}/src/config.json" > "${ui_dir}/src/new_config.json"
  mv "${ui_dir}/src/new_config.json" "${ui_dir}/src/config.json" 
  jq '.' "${ui_dir}/src/config.json"

  result="$?"
  [ "$result" -ne "0" ] && err "[ui_config|out]  => ${result}" && exit 1
  info "[ui_config|out] => ${result}"
}

spa_upload(){
  info "[spa_upload|in] ($1, $2, $3)"

  [ -z "$1" ] && usage
  build_dir="$1/build"
  [ -z "$2" ] && usage
  local stack="$2"
  [ -z "$3" ] && usage
  local outputName="$3"

  outputs=$(aws cloudformation describe-stacks --stack-name "$stack"  --query 'Stacks[0].Outputs' --output=json)
  bucket=$(echo "$outputs" | jq -r ".[] | select(.ExportName == \"${outputName}\") | .OutputValue")
  bucket_url="s3://${bucket}"
  info "[spa_upload] bucket_url: $bucket_url"

  aws s3 rm "$bucket_url" --recursive
  aws s3 cp "$build_dir" "$bucket_url" --recursive

  result="$?"
  [ "$result" -ne "0" ] && err "[spa_upload|out]  => ${result}" && exit 1
  info "[spa_upload|out] => ${result}"
}

get_cloudfront_cidr(){
  info "[get_cloudfront_cidr|in] ($1)"

  [ -z "$1" ] && usage
  output_file="$1"

  prefix_list_id=$(aws ec2 describe-managed-prefix-lists | jq -r ".\"PrefixLists\" | .[] | select(.PrefixListName == \"com.amazonaws.global.cloudfront.origin-facing\") | .PrefixListId")
  outputs=$(aws ec2 get-managed-prefix-list-entries --prefix-list-id "$prefix_list_id" --output json)
  echo $outputs | jq -r ".\"Entries\"" > "$output_file"

  result="$?"
  [ "$result" -ne "0" ] && err "[get_cloudfront_cidr|out]  => ${result}" && exit 1
  info "[get_cloudfront_cidr|out] => ${result}"
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

invalidate_distribution(){
  info "[invalidate_distribution|in] ($1, $2)"

  [ -z "$1" ] && usage
  local stack="$1"
  [ -z "$2" ] && usage
  local distributionIdOutputName="$2"

  outputs=$(aws cloudformation describe-stacks --stack-name "$stack" --query 'Stacks[0].Outputs' --output=json)
  distributionId=$(echo "$outputs" | jq -r ".[] | select(.ExportName == \"$distributionIdOutputName\") | .OutputValue")
  info "[invalidate_distribution] distributionId: ${distributionId})"
  aws cloudfront create-invalidation --distribution-id $distributionId --paths "/*"
  result="$?"
  [ "$result" -ne "0" ] && err "[invalidate_distribution|out]  => ${result}" && exit 1
  info "[invalidate_distribution|out] => ${result}"
}

lib_integtest(){
  info "[lib_integtest|in]"
  _pwd=`pwd`
  cd "$this_folder"
  integ-runner --verbose --update-on-failed
  result="$?"
  cd "$_pwd"
  [ "$result" -ne "0" ] && err "[lib_integtest|out]  => ${result}" && exit 1
  info "[lib_integtest|out] => ${result}"
}

# -------------------------------------
usage() {
  cat <<EOM
  usage:
  $(basename $0) { option }
      options:
      - commands: lists handy commands we use all the time
      - set_aws_profile <profile> <key> <secret> <region> [output=json]
      - bashutils:  updates bashutils include file
      ...library section
      - deps:     install lib dependencies
      - test:     run library tests
      - build:    build/compile lib code
      - integration_test: runs integration tests
      - publish:  publishes package to npm
      - get_cloudfront_cidr:  retrieves current aws region cloudfront cidr blocks list into a file
      ... infra testing section
      - test_infra:
        - reqs: sets up the cdk environment for testing the deployment
        - on: deploys cdk test infrastructure
        - off: destroys cdk test infrastructure
      ... test ui section
      - test_ui:
        - reqs:     install ui dependencies
        - run:      runs test ui locally
        - config:   creates configuration for the test ui based on infrastructure deployed
        - build:    build/compiles ui code
        - upload:   uploads the test ui to the infrastructure
      
EOM
  exit 1
}

debug "1: $1 2: $2 3: $3 4: $4 5: $5 6: $6 7: $7 8: $8 9: $9"

case "$1" in
  commands)
    commands
    ;;
  set_aws_profile)
    set_aws_profile $2 $3 $4 $5 $6
    ;;
  bashutils)
    update_bashutils
    ;;
  deps)
    npm install
    ;;
  test)
    npm run test
    ;;
  build)
    npm run build
    ;;
  integration_test)
    lib_integtest
    ;;
  publish)
    npm_publish "$NPM_REGISTRY" "$NPM_TOKEN" "$this_folder"
    ;;
  get_cloudfront_cidr)
    get_cloudfront_cidr "$CLOUDFRONT_CIDR_FILE"
    ;;
  test_infra)
    case "$2" in
      reqs)
        infra_reqs "$TEST_DEPLOY_INFRA_DIR"
        ;;
      on)
        cdk_infra bootstrap "$TEST_DEPLOY_INFRA_DIR" "$3" && cdk_infra on "$TEST_DEPLOY_INFRA_DIR" "$3"
        ;;
      off)
        cdk_infra off "$TEST_DEPLOY_INFRA_DIR" "$3"
        ;;
      *)
        usage
        ;;
    esac
    ;;
  test_ui)
    case "$2" in
      reqs)
        npm_deps "$TEST_FRONTEND_DIR"
        ;;
      run)
        run_local "$TEST_FRONTEND_DIR"
        ;;
      build)
        ui_build "$TEST_FRONTEND_DIR"
        ;;
      config)
        ui_config "$TEST_FRONTEND_DIR" "$STACK" "$OUTPUT_DISTRIBUTION_URL"
        ;;
      upload)
        spa_upload "$TEST_FRONTEND_DIR" "$STACK" "$OUTPUT_BUCKET_SPA" && invalidate_distribution "$STACK" "$OUTPUT_DISTRIBUTION_ID"
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