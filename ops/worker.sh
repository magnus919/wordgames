#!/bin/sh
set -eu
case "${GENERATE_ON_STARTUP:-true}" in
  true|false) ;;
  *) echo 'GENERATE_ON_STARTUP must be true or false.' >&2; exit 64 ;;
esac
umask 077
/app/render-crontab.sh > /etc/crontabs/root
/app/wordgames migrate
if [ "${GENERATE_ON_STARTUP:-true}" = true ]; then
  /app/wordgames generate || echo 'Startup generation failed; inspect attempt records and worker logs.' >&2
fi
exec busybox crond -f -l 6 -c /etc/crontabs
