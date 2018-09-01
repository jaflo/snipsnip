#!/bin/sh

out=$(ffmpeg -i $1 2>&1 | grep Audio)
bit=$(echo $out | awk -F", " '{print $5}' | cut -d' ' -f1)
framerate=$(echo $out | awk -F", " '{print $2}' | cut -d' ' -f1)

# echo "$3 - $4 from $1 to $2, $6"
# echo "Detected ${bit}k bitrate"

if [ -n "$bit" ]; then
	ffmpeg \
		-i $1 -i $1 \
		-filter_complex \
			"[0]atrim=0:$3[a]; [1]atrim=$4[b]; \
			[a][b]acrossfade=duration=$5:o=1:c1=$6:c2=$6" \
		-b:a ${bit}k \
		-max_muxing_queue_size 9999 \
		$2 -y -loglevel error -hide_banner -nostats
else
	ffmpeg \
		-i $1 -i $1 \
		-filter_complex \
			"[0]atrim=0:$3[a]; [1]atrim=$4[b]; \
			[a][b]acrossfade=duration=$5:o=1:c1=$6:c2=$6" \
		-max_muxing_queue_size 9999 \
		$2 -y -loglevel error -hide_banner -nostats
fi
