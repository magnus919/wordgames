#!/bin/sh
set -eu
/app/wordgames migrate
# Run at startup, then retry daily. Missing credentials fail visibly but don't
# kill cron; the reviewed bootstrap buffer remains playable.
/app/wordgames generate || echo 'Startup generation failed; inspect attempt records and worker logs.' >&2
exec busybox crond -f -l 6 -c /etc/crontabs
