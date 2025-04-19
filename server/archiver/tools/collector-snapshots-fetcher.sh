#!/bin/bash


PREFIX="$1"

if [ -z "$PREFIX" ]; then
    echo "Usage: $0 <prefix>"
    echo "Example: $0 20250322"
    exit 1
fi

CFG="/opt/weather/server/archiver/tools/collector-snapshots-fetcher.secrets"
if [ -f "$CFG" ]; then
    source "$CFG"
else
    echo "archiver: collector: snapshot-fetcher: config: file not found at $CFG"
    exit 1
fi
for VAR in SSH_KEY SSH_PORT SSH_USER SSH_HOST; do
    if [ -z "${!VAR}" ]; then
        echo "archiver: collector: snapshot-fetcher: config: error, $VAR not found in config"
        exit 1
    fi
done
REMOTE_DIR="/opt/storage/snapshots"
LOCAL_DIR="/opt/storage/snapshots"


echo "archiver: collector: snapshot-fetcher: sync starting for $PREFIX"


mkdir -p "$LOCAL_DIR/$PREFIX"
remote_files=$(ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "ls -la $REMOTE_DIR | grep $PREFIX")
temp_file=$(mktemp)
echo "$remote_files" > "$temp_file"
file_info=$(awk '{print $5 " " $9}' "$temp_file")
total_size=0
total_count=0
files_to_download=()
sizes_to_download=()
while IFS= read -r line; do
    [ -z "$line" ] && continue
    size=$(echo "$line" | awk '{print $1}')
    filename=$(echo "$line" | awk '{print $2}')
    [[ "$filename" != *"$PREFIX"* ]] && continue
    if [ ! -f "$LOCAL_DIR/$PREFIX/$filename" ]; then
        total_size=$((total_size + size))
        total_count=$((total_count + 1))
        files_to_download+=("$filename")
        sizes_to_download+=("$size")
    fi
done <<< "$file_info"
rm "$temp_file"


echo "archiver: collector: snapshot-fetcher: sync found $total_count files with total size $(numfmt --to=iec-i --suffix=B --format="%.2f" $total_size)"
if [ "$total_count" -eq 0 ]; then
    exit 0
fi

current_count=0
current_size=0
for i in "${!files_to_download[@]}"; do
    filename="${files_to_download[$i]}"
    filesize="${sizes_to_download[$i]}"
    current_count=$((current_count + 1))
    echo -n "archiver: collector: snapshot-fetcher: sync get $current_count/$total_count ($(numfmt --to=iec-i --suffix=B --format="%.2f" $current_size)/$(numfmt --to=iec-i --suffix=B --format="%.2f" $total_size)): $filename ... "
    ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "cat $REMOTE_DIR/$filename" > "$LOCAL_DIR/$PREFIX/$filename"
    code=$?
    progress_percent=$(( (current_size * 100) / total_size ))
    if [ $code -eq 0 ]; then
        echo "done ($progress_percent% complete)"
        current_size=$((current_size + filesize))
    else
        echo "failed ($progress_percent% complete)"
    fi
done


echo "archiver: collector: snapshot-fetcher: sync complete, got $current_count files with total size $(numfmt --to=iec-i --suffix=B --format="%.2f" $current_size)"

