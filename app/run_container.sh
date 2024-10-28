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

IMAGE_NAME=pvdatainsights-streamlit
PORT=80

_pwd=`pwd`
cd "$this_folder"

docker build -t $IMAGE_NAME .
docker run -p $PORT:80 $IMAGE_NAME

cd "$_pwd"
