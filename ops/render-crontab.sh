#!/bin/sh
set -eu
schedule=${CRON_SCHEDULE:-17 3 * * *}
# Accept only numeric five-field cron syntax. Never evaluate environment text as
# shell code, and never permit a second crontab line or a command suffix.
case "$schedule" in
  *[!0123456789\ */,-]*) echo 'CRON_SCHEDULE must contain five numeric cron fields.' >&2; exit 64 ;;
esac
set -f
set -- $schedule
if [ "$#" -ne 5 ]; then
  echo 'CRON_SCHEDULE must contain exactly five fields.' >&2
  exit 64
fi
printf '%s /app/wordgames generate >> /proc/1/fd/1 2>> /proc/1/fd/2\n' "$schedule"
