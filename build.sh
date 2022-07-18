#!/bin/bash

set -euxo pipefail

date=$( date +%Y%m%d)
title="$1"

article_name="${date}_${title}"

git co -b "$article"
mkdir "articles/$article"
echo '# 20220718 CSGO surf' > "articles/${article}/${article}.md"

