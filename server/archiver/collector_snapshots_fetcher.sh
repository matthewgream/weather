#!/bin/bash


PREFIX="$1"

if [ -z "$PREFIX" ]; then
    echo "Usage: $0 <prefix>"
    echo "Example: $0 20250322"
    exit 1
fi

CFG="/opt/weather/server/archiver/collector_snapshots_fetcher.secrets"
if [ -f "$CFG" ]; then
    source "$CFG"
else
    echo "Error: Configuration file not found at $CFG"
    exit 1
fi
for VAR in SSH_KEY SSH_PORT SSH_USER SSH_HOST; do
    if [ -z "${!VAR}" ]; then
        echo "Error: $VAR is not set in configuration file"
        exit 1
    fi
done
REMOTE_DIR="/opt/storage/snapshots"
LOCAL_DIR="/opt/storage/snapshots"


echo "Starting snapshot sync for files with prefix: $PREFIX"


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


echo "Found $total_count files to download with total size of $(numfmt --to=iec-i --suffix=B --format="%.2f" $total_size)"
if [ "$total_count" -eq 0 ]; then
    echo "No new files to download."
    exit 0
fi

current_count=0
current_size=0
for i in "${!files_to_download[@]}"; do
    filename="${files_to_download[$i]}"
    filesize="${sizes_to_download[$i]}"
    current_count=$((current_count + 1))
    echo -n "Downloading file $current_count/$total_count ($(numfmt --to=iec-i --suffix=B --format="%.2f" $current_size)/$(numfmt --to=iec-i --suffix=B --format="%.2f" $total_size)): $filename ... "
    ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "cat $REMOTE_DIR/$filename" > "$LOCAL_DIR/$PREFIX/$filename"
    if [ $? -eq 0 ]; then
        echo "Done"
        current_size=$((current_size + filesize))
    else
        echo "Failed"
    fi
    progress_percent=$(( (current_size * 100) / total_size ))
    echo "Progress: $progress_percent% complete"
done


echo "Sync completed. Downloaded $current_count files with total size of $(numfmt --to=iec-i --suffix=B --format="%.2f" $current_size)"
